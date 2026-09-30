// Cartera virtual. Todas las operaciones se calculan con datos de mercado reales
// en el momento de la llamada; nunca se firma ni se envía nada a una red real.
import { createHash } from "node:crypto";
import { config } from "../config.js";
import { db, logJournal, now } from "../db.js";
import * as market from "../market/binance.js";
import { fetchJson, isTransientError } from "../market/http.js";
import { SOL_MINT, USDC_MINT } from "../market/jupiter.js";
import { recordTrade } from "./positions.js";
import { VENUES, type Allocation, type ChainId, type Holding, type TradeMeta, type VenueId } from "./types.js";
import { fillMarketOrder } from "./venues/binance.js";
import { allChains, binance, getChain, getVenue, type CostLine, type Delta } from "./venues/index.js";
import type { TokenRef } from "./venues/types.js";

export type Venue = VenueId;
export type { Holding };

const DUST = 1e-12;

/** ¿La misión opera con dinero real? */
export function isLiveMission(missionId: number): boolean {
  return (db.prepare("SELECT mode FROM missions WHERE id = ?").get(missionId) as { mode?: string } | undefined)?.mode === "live";
}

export function assertSimulated(missionId: number, what: string) {
  if (isLiveMission(missionId)) {
    throw new Error(`Esta misión es REAL: ${what} no está disponible así. Con dinero real se opera con execute_swap (swaps) y execute_bridge (mover estables o el nativo entre cadenas); Binance no está disponible.`);
  }
}

export function getHoldings(missionId: number): Holding[] {
  return db
    .prepare("SELECT venue, asset, symbol, decimals, amount FROM holdings WHERE mission_id = ? AND amount > ? ORDER BY venue, symbol")
    .all(missionId, DUST) as unknown as Holding[];
}

export function balance(missionId: number, venue: Venue, asset: string): number {
  const row = db.prepare("SELECT amount FROM holdings WHERE mission_id = ? AND venue = ? AND asset = ?").get(missionId, venue, asset) as
    | { amount: number }
    | undefined;
  return row?.amount ?? 0;
}

function adjust(missionId: number, venue: Venue, asset: string, symbol: string, decimals: number, delta: number) {
  const next = balance(missionId, venue, asset) + delta;
  if (next < -DUST) throw new Error(`Saldo insuficiente de ${symbol} en ${venue}`);
  db.prepare(
    `INSERT INTO holdings (mission_id, venue, asset, symbol, decimals, amount) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(mission_id, venue, asset) DO UPDATE SET amount = excluded.amount`,
  ).run(missionId, venue, asset, symbol, decimals, Math.max(0, next));
}

/** Aplica varios movimientos de saldo de forma atómica. */
function applyAtomically(fn: () => void) {
  db.exec("SAVEPOINT apply");
  try {
    fn();
    db.exec("RELEASE apply");
  } catch (err) {
    db.exec("ROLLBACK TO apply");
    db.exec("RELEASE apply");
    throw err;
  }
}

/** Aplica cambios de saldo en un sitio de forma atómica (falla si alguno deja un saldo negativo). */
export function applyDeltas(missionId: number, venue: VenueId, deltas: Delta[]) {
  applyAtomically(() => {
    for (const d of deltas) if (d.amount !== 0) adjust(missionId, venue, d.asset, d.symbol, d.decimals, d.amount);
  });
}

export async function solUsdPrice(): Promise<number> {
  const info = await fetchJson<Array<Record<string, any>>>(`https://lite-api.jup.ag/tokens/v2/search?query=${SOL_MINT}`, 15_000, 30_000);
  const price = info.find((t) => t.id === SOL_MINT)?.usdPrice;
  if (typeof price !== "number") throw new Error("No se pudo obtener el precio de SOL");
  return price;
}

/** Comprueba un reparto: sitios conocidos, porcentajes no negativos que suman 100. */
export function validateAllocation(allocation: Allocation): Allocation {
  const clean: Allocation = {};
  for (const [venue, pct] of Object.entries(allocation)) {
    if (!VENUES.includes(venue as VenueId)) throw new Error(`Reparto: "${venue}" no existe. Disponibles: ${VENUES.join(", ")}`);
    if (!(typeof pct === "number" && pct >= 0)) throw new Error(`Reparto: el porcentaje de ${venue} debe ser un número positivo`);
    if (pct > 0) clean[venue as VenueId] = pct;
  }
  const total = Object.values(clean).reduce((t, x) => t + x, 0);
  if (Math.abs(total - 100) > 0.5) throw new Error(`Reparto: los porcentajes suman ${total} y deben sumar 100`);
  return clean;
}

/**
 * Cartera inicial según el reparto. En cada cadena, casi todo en su stablecoin y una parte en el
 * token nativo para pagar la red (un 3 % de lo asignado, entre el mínimo y el máximo de esa cadena,
 * y nunca más de la mitad). En Binance, todo en USDT. Puro: recibe los precios de los nativos.
 */
export function planPortfolio(initialUsd: number, allocation: Allocation, nativePrices: Partial<Record<ChainId, number>>): Holding[] {
  const holdings: Holding[] = [];
  for (const [venue, pct] of Object.entries(validateAllocation(allocation)) as Array<[VenueId, number]>) {
    const shareUsd = (initialUsd * pct) / 100;
    const v = getVenue(venue);
    if (v.kind === "cex") {
      holdings.push({ venue, asset: "USDT", symbol: "USDT", decimals: 8, amount: shareUsd });
      continue;
    }
    const price = nativePrices[v.id];
    if (!price) throw new Error(`Falta el precio de ${v.native.symbol} para preparar la cartera`);
    const gasUsd = Math.min(Math.max(shareUsd * 0.03, v.gasBudgetUsd.min), v.gasBudgetUsd.max, shareUsd * 0.5);
    const nativeAmount = Number((gasUsd / price).toFixed(9));
    holdings.push({ venue, asset: v.cash.address, symbol: v.cash.symbol, decimals: v.cash.decimals, amount: shareUsd - nativeAmount * price });
    holdings.push({ venue, asset: v.native.address, symbol: v.native.symbol, decimals: v.native.decimals, amount: nativeAmount });
  }
  return holdings;
}

/** Deja la cartera de la misión con los saldos indicados (los de planPortfolio). */
export function resetPortfolio(missionId: number, holdings: Holding[]) {
  applyAtomically(() => {
    db.prepare("DELETE FROM holdings WHERE mission_id = ?").run(missionId);
    for (const h of holdings) adjust(missionId, h.venue, h.asset, h.symbol, h.decimals, h.amount);
  });
}

/**
 * Cierra todas las posiciones a mercado con precios reales: en cada cadena, los tokens → su stablecoin
 * (conservando el nativo justo para pagar la red) y en Binance, los activos → USDC/USDT.
 * Devuelve lo que no se pudo vender.
 */
/**
 * Una venta del cierre que falla por la red o por el límite de peticiones (429) se reintenta: en la M2 de la
 * v0.35.2 un 429 dejó POND sin vender al acabar el plazo. Un fallo de otro tipo (sin ruta, saldo) no.
 */
async function withRetries<T>(fn: () => Promise<T>, attempts = 4, waitMs = LIQUIDATION_RETRY_MS): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts || !isTransientError(err)) throw err;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}
const LIQUIDATION_RETRY_MS = Number(process.env.LIQUIDATION_RETRY_MS ?? 20_000);

/**
 * Vende todo a estables. Con `nativeOnly`, solo el nativo que quede (segundo paso de un cierre por objetivo);
 * con `keepNative`, todo menos el nativo (primer paso: si al final no se cierra, sigue habiendo gas).
 *
 * Con `minOut` (cierre por objetivo), cada token se vende como una orden límite: si su venta no da al menos
 * ese mínimo, se para ahí y se lanza CloseAborted sin tocar lo que queda ni los futuros. En la M17 de la v0.37.1
 * se dio el objetivo por alcanzado con 57,83 $, la venta dio 53,20 un segundo después y la misión siguió sin
 * la posición ni sus órdenes.
 */
export async function liquidateAll(
  missionId: number,
  sessionId: number | null,
  reasoning: string,
  opts: { keepNative?: boolean; nativeOnly?: boolean; minOut?: (venue: VenueId, asset: string) => number | undefined } = {},
): Promise<string[]> {
  const { closeAllPerps } = await import("./perps.js");
  const holdings = getHoldings(missionId);
  const meta = { exitReason: reasoning };
  // Primero los futuros: su margen vuelve como efectivo a su cadena. En un cierre con mínimos van después
  // de los tokens: si una venta no llega, siguen abiertos.
  const problems: string[] = opts.nativeOnly || opts.minOut ? [] : await closeAllPerps(missionId, reasoning);

  for (const chain of allChains()) {
    const tokens = opts.nativeOnly ? [] : holdings.filter((h) => h.venue === chain.id && !chain.isCash(h.asset) && h.asset !== chain.native.address);
    for (const h of tokens) {
      const minOut = opts.minOut?.(chain.id, h.asset);
      try {
        await withRetries(() => swap({ missionId, sessionId, chain: chain.id, input: h.asset, output: chain.cash.address, sellAll: true, slippageBps: 300, reasoning, meta, minOut }));
      } catch (err) {
        if (err instanceof LimitNotReached) throw new CloseAborted(h.symbol, chain.label, err.got, err.min);
        problems.push(`${h.symbol} (${chain.label}): ${(err as Error).message}`);
      }
    }
    // El nativo se vende al final, dejando lo necesario para la fee de esa última transacción.
    // Con dinero real no se vende: hace falta para pagar la red en las siguientes misiones.
    const nativeLeft = balance(missionId, chain.id, chain.native.address) - chain.liquidationReserve;
    if (nativeLeft > 0.000001 && !isLiveMission(missionId) && !opts.keepNative) {
      const amount = Number(nativeLeft.toFixed(chain.native.decimals));
      await withRetries(() => swap({ missionId, sessionId, chain: chain.id, input: chain.native.address, output: chain.cash.address, amount, slippageBps: 100, reasoning, meta })).catch(
        (err) => problems.push(`${chain.native.symbol} (${chain.label}): ${(err as Error).message}`),
      );
    }
  }

  if (opts.minOut && !opts.nativeOnly) problems.push(...(await closeAllPerps(missionId, reasoning)));

  for (const h of holdings.filter((h) => !opts.nativeOnly && h.venue === "binance" && !binance.isCash(h.asset))) {
    let sold = false;
    for (const quote of ["USDC", "USDT"]) {
      const symbol = `${h.asset}${quote}`;
      const info = await market.getSymbolInfo(symbol).catch(() => null);
      if (!info) continue;
      // Un resto por debajo del step del par no se puede vender (polvo): no es un problema de liquidación.
      if (balance(missionId, "binance", h.asset) < info.stepSize) {
        sold = true;
        break;
      }
      try {
        await binanceMarketOrder({ missionId, sessionId, symbol, side: "SELL", amount: balance(missionId, "binance", h.asset), reasoning, meta });
        sold = true;
        break;
      } catch {
        /* se prueba el siguiente par */
      }
    }
    if (!sold) problems.push(`${h.symbol} (Binance): sin par vendible a USDC/USDT`);
  }
  return problems;
}

// ─── Swaps en cadenas (agregadores de DEX) ──────────────────────────────────

const describeCosts = (costs: CostLine[]) => costs.map((c) => `${c.kind}: ${Number(c.amount.toPrecision(6))} ${c.symbol}`);

/** Una orden límite no se llena: el precio de ese momento no llega al fijado (no se ha enviado nada). */
export class LimitNotReached extends Error {
  constructor(readonly got: number, readonly min: number) {
    super(`El precio no llega al límite: saldrían ${got}, el límite pide ${min}`);
  }
}

/** Un cierre con mínimos se ha parado: una venta no llegaba a lo cotizado (lo vendido antes, vendido queda). */
export class CloseAborted extends Error {
  constructor(readonly symbol: string, readonly chainLabel: string, readonly got: number, readonly min: number) {
    super(`la venta de ${symbol} (${chainLabel}) daría ${Number(got.toPrecision(6))} y la cotización que confirmó el objetivo pedía al menos ${Number(min.toPrecision(6))}`);
  }
}

export async function swap(args: {
  missionId: number;
  sessionId: number | null;
  chain: ChainId;
  input: string;
  output: string;
  /** Cantidad del token de entrada. Con `sellAll`, se vende todo el saldo. */
  amount?: number;
  sellAll?: boolean;
  slippageBps: number;
  reasoning: string;
  meta?: TradeMeta;
  /**
   * Mínimo que debe dar el swap (orden límite): si la cotización del momento da menos, no se ejecuta ni se
   * paga nada y se lanza LimitNotReached. Lo usan las tomas de beneficio de las órdenes condicionales.
   */
  minOut?: number;
  /**
   * Orden límite real (toma de beneficio): se llena exactamente a `minOut`, no al precio del pico. En las
   * órdenes límite de Jupiter recibes lo que fijaste; lo que el mercado dé por encima se lo queda quien la ejecuta.
   */
  fillAtLimit?: boolean;
}) {
  // Misión real: se ejecuta en la cadena con la cartera de la IA (firma el firmante, no este proceso).
  if (isLiveMission(args.missionId)) {
    const { liveSwap } = await import("../live/execute.js");
    return liveSwap(args);
  }
  const chain = getChain(args.chain);
  const m = args.missionId;
  const [input, output] = await Promise.all([chain.resolveToken(args.input), chain.resolveToken(args.output)]);
  if (input.address === output.address) throw new Error("El token de entrada y salida son el mismo");

  const have = balance(m, chain.id, input.address);
  const amount = args.sellAll ? have : (args.amount ?? 0);
  if (!(amount > 0)) throw new Error(args.sellAll ? `No tienes ${input.symbol} en ${chain.label}` : "La cantidad debe ser positiva (o usa sell_all)");
  if (amount > have + DUST) throw new Error(`Saldo insuficiente: tienes ${have} ${input.symbol} y quieres vender ${amount}`);

  let quote = await chain.quote({ input, output, amountIn: amount, slippageBps: args.slippageBps });
  if (args.minOut !== undefined && quote.amountOut < args.minOut) throw new LimitNotReached(quote.amountOut, args.minOut);
  if (args.fillAtLimit && args.minOut !== undefined && quote.amountOut > args.minOut) {
    const f = args.minOut / quote.amountOut;
    quote = { ...quote, amountOut: args.minOut, grossOut: quote.grossOut * f };
  }
  const settled = chain.settle(quote, {
    balance: (asset) => balance(m, chain.id, asset),
    approved: (asset) => Boolean(db.prepare("SELECT 1 FROM evm_approvals WHERE mission_id = ? AND chain = ? AND token = ?").get(m, chain.id, asset)),
  });
  // Un approve enviado queda hecho aunque el swap después revierta.
  for (const token of settled.approvals ?? []) {
    db.prepare("INSERT OR IGNORE INTO evm_approvals (mission_id, chain, token, approved_at) VALUES (?, ?, ?, ?)").run(m, chain.id, token, now());
  }
  if (!settled.ok) {
    // Una transacción que falla en la cadena puede costar igualmente (gas quemado).
    if (settled.deltas.length) {
      applyDeltas(m, chain.id, settled.deltas);
      logJournal({
        missionId: m,
        sessionId: args.sessionId,
        kind: "failed_tx",
        summary: `Swap fallido en ${chain.label}: ${settled.error}`,
        reasoning: args.reasoning,
        details: { chain: chain.id, costs: describeCosts(settled.costs) },
      });
    }
    throw new Error(settled.error);
  }

  // Como al firmar la cotización que viste: si hace poco cotizaste este mismo swap, la ejecución no puede
  // salir peor que esa cotización menos tu slippage. Si sale peor, la transacción revierte y pagas la red.
  const key = quoteKey(m, chain.id, input.address, output.address);
  const ref = lastQuotes.get(key);
  lastQuotes.delete(key);
  // Vale también si la cantidad cambia algo (hasta un 25 %), en proporción: en la M30 de la v0.37.3 cotizó 40 $,
  // compró 42 y se llenó un 30 % por debajo sin protección. Con más cantidad, lo esperado queda algo alto (el
  // impacto crece más que la cantidad): protege de más, nunca de menos.
  if (ref && Date.now() - ref.at <= QUOTE_TTL_MS && Math.abs(amount - ref.amountIn) <= ref.amountIn * QUOTE_AMOUNT_TOLERANCE) {
    const expected = ref.amountOut * (amount / ref.amountIn);
    const minOut = expected * (1 - args.slippageBps / 10_000);
    if (quote.amountOut < minOut) {
      const burned = settled.costs.filter((c) => c.kind === "network_fee" || c.kind === "l1_fee" || c.kind === "approval").reduce((s, c) => s + c.amount, 0);
      if (burned > 0) applyDeltas(m, chain.id, [{ asset: chain.native.address, symbol: chain.native.symbol, decimals: chain.native.decimals, amount: -burned }]);
      const worse = (1 - quote.amountOut / expected) * 100;
      const error =
        `El swap revierte: el precio se ha movido más que tu slippage. Cotizaste ${Number(expected.toPrecision(6))} ${output.symbol} y ahora ` +
        `saldrían ${Number(quote.amountOut.toPrecision(6))} (${worse.toFixed(1)} % menos; tu límite era ${args.slippageBps / 100} %). ` +
        `Has pagado la red (${Number(burned.toPrecision(3))} ${chain.native.symbol}).`;
      logJournal({ missionId: m, sessionId: args.sessionId, kind: "failed_tx", summary: `Swap fallido en ${chain.label}: slippage superado (${worse.toFixed(1)} % peor que tu cotización)`, reasoning: args.reasoning });
      throw new Error(error);
    }
  }
  applyDeltas(m, chain.id, settled.deltas);

  const result = {
    chain: chain.id,
    sold: `${amount} ${input.symbol}`,
    received: `${quote.amountOut} ${output.symbol}`,
    effectivePrice: `1 ${output.symbol} = ${(amount / quote.amountOut).toPrecision(6)} ${input.symbol}`,
    priceImpactPct: quote.priceImpactPct,
    route: quote.route,
    costs: describeCosts(settled.costs),
    ...settled.info,
    ...(quote.warnings.length ? { warnings: quote.warnings } : {}),
  };
  logJournal({
    missionId: m,
    sessionId: args.sessionId,
    kind: "swap",
    summary: `Swap ${Number(amount.toPrecision(6))} ${input.symbol} → ${Number(quote.amountOut.toPrecision(6))} ${output.symbol}${chain.id === "solana" ? "" : ` en ${chain.label}`}`,
    reasoning: args.reasoning,
    details: { inputMint: input.address, outputMint: output.address, ...result },
  });

  // Valor de la operación en USD: el lado estable si lo hay (es exacto); si no, el precio de mercado.
  let valueUsd = chain.isCash(input.address) ? amount : chain.isCash(output.address) ? quote.amountOut : 0;
  if (!valueUsd) {
    const prices = await chain.priceUsd([input.address, output.address]).catch(() => ({}) as Record<string, number>);
    valueUsd = (prices[input.address] ?? 0) * amount || (prices[output.address] ?? 0) * quote.amountOut;
  }
  await recordTrade({
    missionId: m,
    venue: chain.id,
    sold: { asset: input.address, qty: amount },
    bought: { asset: output.address, symbol: output.symbol, qty: quote.amountOut },
    valueUsd,
    meta: args.meta,
  }).catch((err) => console.error(`No se pudo registrar la posición: ${(err as Error).message}`));
  const exit = await sellNow(m, chain, output, quote.amountOut, valueUsd, chain.isCash(input.address) || input.address === chain.native.address);
  const cancelled = await cancelOrdersForSoldOut(m, chain.id, input);
  return { ...result, ...(exit ?? {}), ...(cancelled.length ? { ordersCancelled: cancelled } : {}) };
}

/**
 * Si ya no queda nada de un token, sus órdenes que venderían todo el saldo sobran: se cancelan en el momento de
 * la venta, las de precio y las de tiempo. Antes se cancelaban en la siguiente revisión (hasta 15 s después, y
 * list_orders las seguía dando por abiertas) y las de tiempo no: se disparaban y fallaban por falta de saldo
 * (M3 de la v0.38.1, el trader las cancelaba a mano). La orden que ha hecho la venta está 'executing': no se toca.
 */
export async function cancelOrdersForSoldOut(missionId: number, venue: ChainId, token: TokenRef): Promise<string[]> {
  if (balance(missionId, venue, token.address) > DUST) return [];
  const chain = getChain(venue);
  const open = db.prepare("SELECT id, action, trigger_label FROM orders WHERE mission_id = ? AND venue = ? AND status = 'open'").all(missionId, venue) as Array<{
    id: number;
    action: string;
    trigger_label: string | null;
  }>;
  const cancelled: string[] = [];
  for (const o of open) {
    const action = JSON.parse(o.action) as { input?: string; sellAll?: boolean };
    if (!action.sellAll || !action.input) continue;
    const input = await chain.resolveToken(action.input).catch(() => null);
    if (input?.address !== token.address) continue;
    if (!db.prepare("UPDATE orders SET status = 'cancelled', closed_at = ? WHERE id = ? AND status = 'open'").run(now(), o.id).changes) continue;
    const summary = `Orden #${o.id} cancelada: ya no te queda ${token.symbol}`;
    logJournal({ missionId, sessionId: null, kind: "order_cancelled", summary });
    cancelled.push(summary);
  }
  return cancelled;
}

/**
 * Tras comprar un token, cuánto darían venderlo en ese mismo instante: el coste de entrar y salir (comisiones y
 * diferencia entre compra y venta), separado de lo que se mueva el precio después. En la tanda de la v0.38.1 el
 * agente veía la venta unos segundos más tarde un 8 % por debajo y lo guardó en su memoria como "diferencial de
 * pump.fun", cuando la ida y vuelta era de un 2-3 % y el resto era el precio moviéndose. Se guarda en la posición
 * (roundTripAtEntryPct) para que las creencias puedan medirlo.
 */
async function sellNow(missionId: number, chain: ReturnType<typeof getChain>, token: TokenRef, qty: number, paidUsd: number, isBuy: boolean) {
  if (!isBuy || chain.isCash(token.address) || token.address === chain.native.address || !(paidUsd > 0) || !(qty > 0)) return null;
  try {
    const q = await chain.quote({ input: token, output: chain.cash, amountIn: qty, slippageBps: 100 });
    const roundTripPct = Number(((1 - q.amountOut / paidUsd) * 100).toFixed(1));
    const pos = db.prepare("SELECT id, research FROM positions WHERE mission_id = ? AND venue = ? AND asset = ? AND status = 'open' ORDER BY id DESC LIMIT 1").get(missionId, chain.id, token.address) as
      | { id: number; research: string | null }
      | undefined;
    if (pos) {
      const research = JSON.parse(pos.research ?? "{}") as Record<string, unknown>;
      // Al añadir a una posición se queda la de la primera compra, la de la entrada.
      if (research.roundTripAtEntryPct === undefined) {
        research.roundTripAtEntryPct = roundTripPct;
        db.prepare("UPDATE positions SET research = ? WHERE id = ?").run(JSON.stringify(research), pos.id);
      }
    }
    return {
      sellNowUsd: Number(q.amountOut.toFixed(4)),
      roundTripNowPct: roundTripPct,
      sellNowNote: "Lo que darías vendiéndolo ahora mismo: la diferencia con lo pagado es el coste de entrar y salir. Lo que cambie a partir de aquí es el precio moviéndose.",
    };
  } catch {
    return null;
  }
}

// Última cotización de cada swap por misión: al ejecutar ese mismo swap poco después, el slippage se mide contra ella.
const lastQuotes = new Map<string, { amountIn: number; amountOut: number; at: number }>();
const QUOTE_TTL_MS = 60_000;
const QUOTE_AMOUNT_TOLERANCE = 0.25;
const quoteKey = (missionId: number, chain: string, input: string, output: string) => `${missionId}:${chain}:${input}:${output}`;

export async function quoteSwap(chainId: ChainId, inputRef: string, outputRef: string, amount: number, slippageBps = 50, missionId?: number | null) {
  const chain = getChain(chainId);
  const [input, output] = await Promise.all([chain.resolveToken(inputRef), chain.resolveToken(outputRef)]);
  const q = await chain.quote({ input, output, amountIn: amount, slippageBps });
  for (const [k, v] of lastQuotes) if (Date.now() - v.at > QUOTE_TTL_MS) lastQuotes.delete(k); // si no, crece con cada token cotizado
  if (missionId != null) lastQuotes.set(quoteKey(missionId, chain.id, input.address, output.address), { amountIn: amount, amountOut: q.amountOut, at: Date.now() });
  return {
    chain: chain.id,
    input: `${amount} ${input.symbol} (${input.address})`,
    output: `${q.amountOut} ${output.symbol} (${output.address})`,
    priceImpactPct: q.priceImpactPct,
    route: q.route,
    ...(q.warnings.length ? { warnings: q.warnings } : {}),
    note:
      "Sin contar los costes de red: se calculan al ejecutar, según tu monedero. Si ejecutas este mismo swap (con un importe hasta un 25 % " +
      "distinto) en menos de 60 s, tu slippage se mide contra esta cotización: si el precio se ha movido más, el swap revierte y pagas solo la red.",
  };
}

// ─── Órdenes de mercado en Binance ──────────────────────────────────────────

export async function binanceMarketOrder(args: {
  missionId: number;
  sessionId: number | null;
  symbol: string;
  side: "BUY" | "SELL";
  amount: number; // BUY: cantidad de quote a gastar. SELL: cantidad base a vender.
  reasoning: string;
  meta?: TradeMeta;
}) {
  assertSimulated(args.missionId, "operar en Binance");
  const info = await market.getSymbolInfo(args.symbol);
  const book = await market.getOrderBook(info.symbol);
  const m = args.missionId;
  const { fill, feePaid, feeAsset, deltas } = fillMarketOrder({
    info,
    book,
    side: args.side,
    amount: args.amount,
    balance: (asset) => balance(m, "binance", asset),
    takerFee: config.binanceTakerFee,
  });
  applyDeltas(m, "binance", deltas);

  const result = {
    symbol: info.symbol,
    side: args.side,
    baseQty: fill.baseQty,
    quoteQty: fill.quoteQty,
    avgPrice: fill.avgPrice,
    bestPrice: fill.bestPrice,
    slippagePct: fill.slippagePct,
    fee: `${feePaid} ${feeAsset}`,
  };
  logJournal({
    missionId: m,
    sessionId: args.sessionId,
    kind: "cex_order",
    summary: `Binance ${args.side} ${fill.baseQty.toPrecision(6)} ${info.baseAsset} @ ${fill.avgPrice.toPrecision(6)} ${info.quoteAsset}`,
    reasoning: args.reasoning,
    details: result,
  });

  // Lo que queda por debajo del step del par no se puede vender: es polvo y la posición se da por cerrada.
  const dust = args.side === "SELL" ? balance(m, "binance", info.baseAsset) : 0;
  const soldQty = dust > 0 && dust < info.stepSize ? fill.baseQty + dust : fill.baseQty;

  // Valor en USD del lado quote: casi siempre una stablecoin; si no, su valor de liquidación.
  const quoteNet = args.side === "BUY" ? fill.quoteQty : fill.quoteQty - feePaid;
  const valueUsd = binance.isCash(info.quoteAsset)
    ? quoteNet
    : (
        await binance
          .liquidationValue({ venue: "binance", asset: info.quoteAsset, symbol: info.quoteAsset, decimals: 8, amount: quoteNet })
          .catch(() => ({ usd: 0 }))
      ).usd;
  await recordTrade({
    missionId: m,
    venue: "binance",
    sold: args.side === "BUY" ? { asset: info.quoteAsset, qty: fill.quoteQty } : { asset: info.baseAsset, qty: soldQty },
    bought:
      args.side === "BUY"
        ? { asset: info.baseAsset, symbol: info.baseAsset, qty: fill.baseQty - feePaid }
        : { asset: info.quoteAsset, symbol: info.quoteAsset, qty: fill.quoteQty - feePaid },
    valueUsd,
    meta: args.meta,
  }).catch((err) => console.error(`No se pudo registrar la posición: ${(err as Error).message}`));
  return result;
}

/**
 * Dirección del monedero EVM de la misión (la misma en Base y BNB Chain, como en MetaMask).
 * Es ficticia: se deriva del id de la misión y no corresponde a ninguna clave real.
 */
export const evmAddress = (missionId: number) => `0x${createHash("sha256").update(`cryptoagent-mission-${missionId}`).digest("hex").slice(0, 40)}`;

// ─── Valoración a precio de mercado ─────────────────────────────────────────

export async function valuation(missionId: number, recordSnapshot = false, opts: { fresh?: boolean } = {}) {
  // Saldos y tránsito se leen en la misma instantánea: si otro proceso abona una transferencia entre
  // las dos lecturas, se contaría dos veces (en la cartera y en tránsito).
  let holdings: Holding[] = [];
  let pending: Array<{ id: number; to_venue: VenueId; asset_in: string; symbol_in: string; decimals_in: number; amount_in: number; arrives_at: string; carry: string | null }> = [];
  applyAtomically(() => {
    holdings = getHoldings(missionId);
    // Lo que está en tránsito (transferencias y puentes) se valora en su destino.
    pending = db
      .prepare("SELECT id, to_venue, asset_in, symbol_in, decimals_in, amount_in, arrives_at, carry FROM transfers WHERE mission_id = ? AND status = 'pending' ORDER BY id")
      .all(missionId) as typeof pending;
    // Puente real: si ya ha llegado algo al destino (el saldo supera el de antes del envío), no se cuenta
    // también en tránsito mientras Li.Fi no lo confirma.
    for (const t of pending) {
      const live = t.carry ? (JSON.parse(t.carry) as { live?: { baseline: number } }).live : undefined;
      if (live) t.amount_in = Math.max(0, t.amount_in - Math.max(0, balance(missionId, t.to_venue, t.asset_in) - live.baseline));
    }
    pending = pending.filter((t) => t.amount_in > 0);
  });
  const lines = await Promise.all(holdings.map(async (h) => ({ ...h, ...(await getVenue(h.venue).liquidationValue(h, opts)) })));
  const transit = await Promise.all(
    pending.map(async (t) => ({
      ...t,
      ...(await getVenue(t.to_venue).liquidationValue({ venue: t.to_venue, asset: t.asset_in, symbol: t.symbol_in, decimals: t.decimals_in, amount: t.amount_in })),
    })),
  );
  let totalUsd = lines.reduce((s, l) => s + l.usd, 0) + transit.reduce((s, t) => s + t.usd, 0);
  const mission = db.prepare("SELECT created_at, initial_usd, benchmark_sol_price, benchmark FROM missions WHERE id = ?").get(missionId) as
    | { created_at: string; initial_usd: number; benchmark_sol_price: number | null; benchmark: string | null }
    | undefined;
  const initialUsd = mission?.initial_usd ?? config.initialUsd;
  // Referencia informativa: si falta un precio, no debe romper la valoración.
  let benchmarkUsd = initialUsd;
  let benchmarkLabel = "capital inicial";
  if (mission?.benchmark) {
    // La cartera inicial sin tocar, valorada ahora.
    const start = JSON.parse(mission.benchmark) as Holding[];
    const values = await Promise.all(start.map((h) => getVenue(h.venue).liquidationValue(h).catch(() => ({ usd: h.amount }))));
    benchmarkUsd = values.reduce((t, x) => t + x.usd, 0);
    benchmarkLabel = "sin operar (la cartera inicial, a precios de ahora)";
  } else if (mission?.benchmark_sol_price) {
    // Misiones antiguas: haber mantenido SOL.
    const solNow = await solUsdPrice().catch(() => null);
    if (solNow) {
      benchmarkUsd = (initialUsd / mission.benchmark_sol_price) * solNow;
      benchmarkLabel = "mantener SOL";
    }
  }

  // Futuros abiertos: cuentan por lo que volvería a la cartera si se cerraran ahora.
  const { openPerps } = await import("./perps.js");
  const perps = await openPerps(missionId).catch(() => []);
  totalUsd += perps.reduce((s, p) => s + p.valueIfClosedUsd, 0);

  if (recordSnapshot) {
    db.prepare("INSERT INTO snapshots (ts, mission_id, total_usd, benchmark_usd, details) VALUES (?, ?, ?, ?, ?)").run(
      now(),
      missionId,
      totalUsd,
      benchmarkUsd,
      JSON.stringify(lines.map((l) => ({ venue: l.venue, symbol: l.symbol, amount: l.amount, usd: l.usd }))),
    );
  }
  return {
    missionId,
    startedAt: mission?.created_at,
    initialUsd,
    totalUsd,
    /** false si algún saldo se valoró sin cotización real: el total es orientativo. */
    reliable: lines.every((l) => l.reliable) && transit.every((t) => t.reliable),
    pnlUsd: totalUsd - initialUsd,
    pnlPct: ((totalUsd - initialUsd) / initialUsd) * 100,
    benchmarkUsd,
    benchmarkLabel,
    evmWallet: evmAddress(missionId),
    holdings: lines.map((l) => ({
      venue: l.venue,
      symbol: l.symbol,
      asset: l.asset,
      amount: l.amount,
      usd: Number(l.usd.toFixed(4)),
      valuedBy: l.method,
    })),
    ...(perps.length ? { perps } : {}),
    ...(transit.length
      ? {
          inTransit: transit.map((t) => ({
            transferId: t.id,
            to: t.to_venue,
            symbol: t.symbol_in,
            amount: t.amount_in,
            usd: Number(t.usd.toFixed(4)),
            arrivesAt: t.arrives_at,
          })),
        }
      : {}),
  };
}
