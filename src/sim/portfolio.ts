// Cartera virtual. Todas las operaciones se calculan con datos de mercado reales
// en el momento de la llamada; nunca se firma ni se envía nada a una red real.
import { config } from "../config.js";
import { db, logJournal, now } from "../db.js";
import * as market from "../market/binance.js";
import { fetchJson } from "../market/http.js";
import { SOL_MINT, USDC_MINT } from "../market/jupiter.js";
import { movePosition, recordTrade } from "./positions.js";
import type { ChainId, Holding, TradeMeta, VenueId } from "./types.js";
import { fillMarketOrder } from "./venues/binance.js";
import { allChains, binance, getChain, getVenue, type CostLine, type Delta } from "./venues/index.js";

// Comisiones de retirada de Binance por la red Solana.
const BINANCE_WITHDRAW_FEES: Record<string, number> = {
  USDC: config.binanceUsdcWithdrawFee,
  SOL: 0.001,
};

export type Venue = VenueId;
export type { Holding };

const DUST = 1e-12;

export function getHoldings(missionId: number): Holding[] {
  return db
    .prepare("SELECT venue, asset, symbol, decimals, amount FROM holdings WHERE mission_id = ? AND amount > ? ORDER BY venue, symbol")
    .all(missionId, DUST) as unknown as Holding[];
}

function balance(missionId: number, venue: Venue, asset: string): number {
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

function applyDeltas(missionId: number, venue: VenueId, deltas: Delta[]) {
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

/**
 * Deja la cartera de la misión con su capital inicial (casi todo en USDC y un poco de SOL para la red).
 * Recibe el precio de SOL para que varias misiones creadas a la vez partan exactamente igual.
 */
export function resetPortfolio(missionId: number, initialUsd: number, solPrice: number) {
  const solUsd = config.initialSol * solPrice;
  if (solUsd >= initialUsd) throw new Error("INITIAL_SOL vale más que el capital inicial");
  applyAtomically(() => {
    db.prepare("DELETE FROM holdings WHERE mission_id = ?").run(missionId);
    adjust(missionId, "solana", USDC_MINT, "USDC", 6, initialUsd - solUsd);
    adjust(missionId, "solana", SOL_MINT, "SOL", 9, config.initialSol);
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
  const settled = chain.settle(quote, { balance: (asset) => balance(m, chain.id, asset) });
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
    ...quote.extra,
    ...(quote.warnings.length ? { warnings: quote.warnings } : {}),
  };
  logJournal({
    missionId: m,
    sessionId: args.sessionId,
    kind: "swap",
    summary: `Swap ${result.sold} → ${result.received}${chain.id === "solana" ? "" : ` en ${chain.label}`}`,
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

// ─── Transferencias entre el monedero de Solana y Binance ────────────────────

export async function transfer(args: {
  missionId: number;
  sessionId: number | null;
  asset: "USDC" | "SOL";
  from: VenueId;
  to: VenueId;
  amount: number;
  reasoning: string;
}) {
  if (!(args.amount > 0)) throw new Error("La cantidad debe ser positiva");
  const route = `${args.from}>${args.to}`;
  if (route !== "solana>binance" && route !== "binance>solana") {
    throw new Error("Por ahora solo se puede transferir entre tu monedero de Solana y Binance (en los dos sentidos)");
  }
  const mint = args.asset === "SOL" ? SOL_MINT : USDC_MINT;
  const decimals = args.asset === "SOL" ? 9 : 6;
  const m = args.missionId;
  let received: number;
  let feeText: string;

  applyAtomically(() => {
    if (args.from === "solana") {
      // Envío on-chain a la dirección de depósito de Binance: se paga la fee de red en SOL.
      adjust(m, "solana", mint, args.asset, decimals, -args.amount);
      adjust(m, "solana", SOL_MINT, "SOL", 9, -config.solanaTxFeeSol);
      received = args.amount;
      adjust(m, "binance", args.asset, args.asset, 8, received);
      feeText = `${config.solanaTxFeeSol} SOL (red)`;
    } else {
      const withdrawFee = BINANCE_WITHDRAW_FEES[args.asset]!;
      if (args.amount <= withdrawFee) throw new Error(`La retirada mínima debe superar la comisión de ${withdrawFee} ${args.asset}`);
      adjust(m, "binance", args.asset, args.asset, 8, -args.amount);
      received = args.amount - withdrawFee;
      adjust(m, "solana", mint, args.asset, decimals, received);
      feeText = `${withdrawFee} ${args.asset} (retirada Binance)`;
    }
  });

  const result = { asset: args.asset, from: args.from, to: args.to, sent: args.amount, received: received!, fee: feeText! };
  logJournal({
    missionId: m,
    sessionId: args.sessionId,
    kind: "transfer",
    summary: `Transferencia ${args.amount} ${args.asset} ${result.from} → ${result.to}`,
    reasoning: args.reasoning,
    details: result,
  });
  // El coste de lo que se mueve viaja con ello (las stablecoins no son posiciones).
  const assetAt = (venue: VenueId) => (venue === "binance" ? args.asset : mint);
  await movePosition({
    missionId: m,
    from: { venue: args.from, asset: assetAt(args.from) },
    to: { venue: args.to, asset: assetAt(args.to), symbol: args.asset },
    qty: args.amount,
    received: received!,
  }).catch((err) => console.error(`No se pudo mover la posición: ${(err as Error).message}`));
  return result;
}

// ─── Valoración a precio de mercado ─────────────────────────────────────────

export async function valuation(missionId: number, recordSnapshot = false) {
  const holdings = getHoldings(missionId);
  const lines = await Promise.all(holdings.map(async (h) => ({ ...h, ...(await getVenue(h.venue).liquidationValue(h)) })));
  const totalUsd = lines.reduce((s, l) => s + l.usd, 0);
  const mission = db.prepare("SELECT created_at, initial_usd, benchmark_sol_price FROM missions WHERE id = ?").get(missionId) as
    | { created_at: string; initial_usd: number; benchmark_sol_price: number | null }
    | undefined;
  const initialUsd = mission?.initial_usd ?? config.initialUsd;
  const benchSolPrice = mission?.benchmark_sol_price ?? 0;
  // La referencia (haber mantenido SOL) es informativa: si no hay precio, no debe romper la valoración.
  const solNow = benchSolPrice ? await solUsdPrice().catch(() => null) : null;
  const benchmarkUsd = benchSolPrice && solNow ? (initialUsd / benchSolPrice) * solNow : initialUsd;

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
    reliable: lines.every((l) => l.reliable),
    pnlUsd: totalUsd - initialUsd,
    pnlPct: ((totalUsd - initialUsd) / initialUsd) * 100,
    benchmarkHoldSolUsd: benchmarkUsd,
    holdings: lines.map((l) => ({
      venue: l.venue,
      symbol: l.symbol,
      asset: l.asset,
      amount: l.amount,
      usd: Number(l.usd.toFixed(4)),
      valuedBy: l.method,
    })),
  };
}
