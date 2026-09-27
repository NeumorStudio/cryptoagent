// Cartera virtual. Todas las operaciones se calculan con datos de mercado reales
// en el momento de la llamada; nunca se firma ni se envía nada a una red real.
import { createHash } from "node:crypto";
import { config } from "../config.js";
import { db, logJournal, now } from "../db.js";
import * as market from "../market/binance.js";
import { fetchJson } from "../market/http.js";
import { SOL_MINT, USDC_MINT } from "../market/jupiter.js";
import { recordTrade } from "./positions.js";
import { VENUES, type Allocation, type ChainId, type Holding, type TradeMeta, type VenueId } from "./types.js";
import { fillMarketOrder } from "./venues/binance.js";
import { allChains, binance, getChain, getVenue, type CostLine, type Delta } from "./venues/index.js";

export type Venue = VenueId;
export type { Holding };

const DUST = 1e-12;

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
export async function liquidateAll(missionId: number, sessionId: number | null, reasoning: string): Promise<string[]> {
  const problems: string[] = [];
  const holdings = getHoldings(missionId);
  const meta = { exitReason: reasoning };

  for (const chain of allChains()) {
    const tokens = holdings.filter((h) => h.venue === chain.id && !chain.isCash(h.asset) && h.asset !== chain.native.address);
    for (const h of tokens) {
      await swap({ missionId, sessionId, chain: chain.id, input: h.asset, output: chain.cash.address, sellAll: true, slippageBps: 300, reasoning, meta }).catch(
        (err) => problems.push(`${h.symbol} (${chain.label}): ${(err as Error).message}`),
      );
    }
    // El nativo se vende al final, dejando lo necesario para la fee de esa última transacción.
    const nativeLeft = balance(missionId, chain.id, chain.native.address) - chain.liquidationReserve;
    if (nativeLeft > 0.000001) {
      const amount = Number(nativeLeft.toFixed(chain.native.decimals));
      await swap({ missionId, sessionId, chain: chain.id, input: chain.native.address, output: chain.cash.address, amount, slippageBps: 100, reasoning, meta }).catch(
        (err) => problems.push(`${chain.native.symbol} (${chain.label}): ${(err as Error).message}`),
      );
    }
  }

  for (const h of holdings.filter((h) => h.venue === "binance" && !binance.isCash(h.asset))) {
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
}) {
  const chain = getChain(args.chain);
  const m = args.missionId;
  const [input, output] = await Promise.all([chain.resolveToken(args.input), chain.resolveToken(args.output)]);
  if (input.address === output.address) throw new Error("El token de entrada y salida son el mismo");

  const have = balance(m, chain.id, input.address);
  const amount = args.sellAll ? have : (args.amount ?? 0);
  if (!(amount > 0)) throw new Error(args.sellAll ? `No tienes ${input.symbol} en ${chain.label}` : "La cantidad debe ser positiva (o usa sell_all)");
  if (amount > have + DUST) throw new Error(`Saldo insuficiente: tienes ${have} ${input.symbol} y quieres vender ${amount}`);

  const quote = await chain.quote({ input, output, amountIn: amount, slippageBps: args.slippageBps });
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
  return result;
}

export async function quoteSwap(chainId: ChainId, inputRef: string, outputRef: string, amount: number, slippageBps = 50) {
  const chain = getChain(chainId);
  const [input, output] = await Promise.all([chain.resolveToken(inputRef), chain.resolveToken(outputRef)]);
  const q = await chain.quote({ input, output, amountIn: amount, slippageBps });
  return {
    chain: chain.id,
    input: `${amount} ${input.symbol} (${input.address})`,
    output: `${q.amountOut} ${output.symbol} (${output.address})`,
    priceImpactPct: q.priceImpactPct,
    route: q.route,
    ...(q.warnings.length ? { warnings: q.warnings } : {}),
    note: "Sin contar los costes de red: se calculan al ejecutar, según tu monedero.",
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

export async function valuation(missionId: number, recordSnapshot = false) {
  const holdings = getHoldings(missionId);
  const lines = await Promise.all(holdings.map(async (h) => ({ ...h, ...(await getVenue(h.venue).liquidationValue(h)) })));
  // Lo que está en tránsito (transferencias y puentes) se valora en su destino.
  const pending = db
    .prepare("SELECT id, to_venue, asset_in, symbol_in, decimals_in, amount_in, arrives_at FROM transfers WHERE mission_id = ? AND status IN ('pending', 'settling') ORDER BY id")
    .all(missionId) as Array<{ id: number; to_venue: VenueId; asset_in: string; symbol_in: string; decimals_in: number; amount_in: number; arrives_at: string }>;
  const transit = await Promise.all(
    pending.map(async (t) => ({
      ...t,
      ...(await getVenue(t.to_venue).liquidationValue({ venue: t.to_venue, asset: t.asset_in, symbol: t.symbol_in, decimals: t.decimals_in, amount: t.amount_in })),
    })),
  );
  const totalUsd = lines.reduce((s, l) => s + l.usd, 0) + transit.reduce((s, t) => s + t.usd, 0);
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
