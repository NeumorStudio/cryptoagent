// Cartera virtual. Todas las operaciones se calculan con datos de mercado reales
// en el momento de la llamada; nunca se firma ni se envía nada a una red real.
import { config } from "../config.js";
import { db, getMeta, logJournal, now, setMeta } from "../db.js";
import * as binance from "../market/binance.js";
import { fetchJson } from "../market/http.js";
import { SOL_MINT, USDC_MINT, fromBaseUnits, getQuote, getTokenInfo, resolveMint, toBaseUnits } from "../market/jupiter.js";
import { recordBinanceTrade, recordSolanaSwap, type TradeMeta } from "./positions.js";

// Renta de una cuenta de token (ATA) en Solana: se paga al recibir un token nuevo
// y se recupera al cerrar la cuenta cuando el saldo vuelve a cero.
const TOKEN_ACCOUNT_RENT_SOL = 0.00203928;
// Comisiones de retirada de Binance por la red Solana.
const BINANCE_WITHDRAW_FEES: Record<string, number> = {
  USDC: config.binanceUsdcWithdrawFee,
  SOL: 0.01,
};

export type Venue = "solana" | "binance";

export interface Holding {
  venue: Venue;
  asset: string;
  symbol: string;
  decimals: number;
  amount: number;
}

const DUST = 1e-12;

export function getHoldings(): Holding[] {
  return db.prepare("SELECT venue, asset, symbol, decimals, amount FROM holdings WHERE amount > ? ORDER BY venue, symbol").all(DUST) as unknown as Holding[];
}

function balance(venue: Venue, asset: string): number {
  const row = db.prepare("SELECT amount FROM holdings WHERE venue = ? AND asset = ?").get(venue, asset) as { amount: number } | undefined;
  return row?.amount ?? 0;
}

function adjust(venue: Venue, asset: string, symbol: string, decimals: number, delta: number) {
  const next = balance(venue, asset) + delta;
  if (next < -DUST) throw new Error(`Saldo insuficiente de ${symbol} en ${venue}`);
  db.prepare(
    `INSERT INTO holdings (venue, asset, symbol, decimals, amount) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(venue, asset) DO UPDATE SET amount = excluded.amount`,
  ).run(venue, asset, symbol, decimals, Math.max(0, next));
}

/** Aplica varios movimientos de saldo de forma atómica. */
function applyAtomically(fn: () => void) {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

async function solUsdPrice(): Promise<number> {
  const info = await fetchJson<Array<Record<string, any>>>(`https://lite-api.jup.ag/tokens/v2/search?query=${SOL_MINT}`);
  const price = info.find((t) => t.id === SOL_MINT)?.usdPrice;
  if (typeof price !== "number") throw new Error("No se pudo obtener el precio de SOL");
  return price;
}

/** Vacía la cartera y la deja con el capital inicial (casi todo en USDC y un poco de SOL para la red). */
export async function resetPortfolio(initialUsd: number) {
  const solPrice = await solUsdPrice();
  const solUsd = config.initialSol * solPrice;
  if (solUsd >= initialUsd) throw new Error("INITIAL_SOL vale más que el capital inicial");
  applyAtomically(() => {
    db.exec("DELETE FROM holdings");
    adjust("solana", USDC_MINT, "USDC", 6, initialUsd - solUsd);
    adjust("solana", SOL_MINT, "SOL", 9, config.initialSol);
    setMeta("start_ts", now());
    setMeta("initial_usd", String(initialUsd));
    setMeta("benchmark_sol_price", String(solPrice));
  });
}

/**
 * Cierra todas las posiciones a mercado con precios reales: tokens de Solana → USDC
 * (conservando el SOL justo para pagar la red) y activos de Binance → USDC/USDT.
 * Devuelve lo que no se pudo vender.
 */
export async function liquidateAll(sessionId: number | null, reasoning: string): Promise<string[]> {
  const problems: string[] = [];
  const holdings = getHoldings();

  for (const h of holdings.filter((h) => h.venue === "solana" && h.asset !== USDC_MINT && h.asset !== SOL_MINT)) {
    await swapSolana({ sessionId, input: h.asset, output: USDC_MINT, amount: h.amount, slippageBps: 300, reasoning, meta: { exitReason: reasoning } }).catch((err) =>
      problems.push(`${h.symbol} (Solana): ${(err as Error).message}`),
    );
  }
  // El SOL se vende al final, dejando lo necesario para la fee de esa última transacción.
  const solLeft = balance("solana", SOL_MINT) - config.solanaTxFeeSol;
  if (solLeft > 0.000001) {
    await swapSolana({ sessionId, input: SOL_MINT, output: USDC_MINT, amount: Number(solLeft.toFixed(9)), slippageBps: 100, reasoning, meta: { exitReason: reasoning } }).catch(
      (err) => problems.push(`SOL (Solana): ${(err as Error).message}`),
    );
  }

  for (const h of holdings.filter((h) => h.venue === "binance" && !STABLES.has(h.asset))) {
    let sold = false;
    for (const quote of ["USDC", "USDT"]) {
      try {
        await binanceMarketOrder({ sessionId, symbol: `${h.asset}${quote}`, side: "SELL", amount: balance("binance", h.asset), reasoning, meta: { exitReason: reasoning } });
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

// ─── Swaps en Solana (Jupiter) ──────────────────────────────────────────────

export async function swapSolana(args: {
  sessionId: number | null;
  input: string;
  output: string;
  amount: number;
  slippageBps: number;
  reasoning: string;
  meta?: TradeMeta;
}) {
  const inputMint = resolveMint(args.input);
  const outputMint = resolveMint(args.output);
  if (inputMint === outputMint) throw new Error("El token de entrada y salida son el mismo");
  if (!(args.amount > 0)) throw new Error("La cantidad debe ser positiva");

  const [inInfo, outInfo] = await Promise.all([getTokenInfo(inputMint), getTokenInfo(outputMint)]);

  const inBalance = balance("solana", inputMint);
  if (args.amount > inBalance + DUST) {
    throw new Error(`Saldo insuficiente: tienes ${inBalance} ${inInfo.symbol} y quieres vender ${args.amount}`);
  }

  const quote = await getQuote(inputMint, outputMint, toBaseUnits(args.amount, inInfo.decimals), args.slippageBps);
  const outAmount = fromBaseUnits(quote.outAmount, outInfo.decimals);

  // Costes de red en SOL: fee de la transacción + renta si hay que crear la cuenta del token recibido.
  const opensAccount = outputMint !== SOL_MINT && balance("solana", outputMint) <= DUST;
  const closesAccount = inputMint !== SOL_MINT && inBalance - args.amount <= DUST;
  const solCost =
    config.solanaTxFeeSol + (opensAccount ? TOKEN_ACCOUNT_RENT_SOL : 0) - (closesAccount ? TOKEN_ACCOUNT_RENT_SOL : 0);

  const solAfter =
    balance("solana", SOL_MINT) - solCost - (inputMint === SOL_MINT ? args.amount : 0) + (outputMint === SOL_MINT ? outAmount : 0);
  if (solAfter < -DUST) {
    throw new Error(`SOL insuficiente para pagar la red (${solCost.toFixed(6)} SOL de fees/renta). En Solana necesitas SOL para operar.`);
  }

  applyAtomically(() => {
    adjust("solana", inputMint, inInfo.symbol, inInfo.decimals, -args.amount);
    adjust("solana", outputMint, outInfo.symbol, outInfo.decimals, outAmount);
    adjust("solana", SOL_MINT, "SOL", 9, -solCost);
  });

  const result = {
    sold: `${args.amount} ${inInfo.symbol}`,
    received: `${outAmount} ${outInfo.symbol}`,
    effectivePrice: `1 ${outInfo.symbol} = ${(args.amount / outAmount).toPrecision(6)} ${inInfo.symbol}`,
    jupiterPriceImpact: quote.priceImpactPct,
    route: quote.routePlan.map((r) => `${r.swapInfo.label ?? r.swapInfo.ammKey} (${r.percent}%)`),
    networkCostSol: solCost,
    tokenAccountOpened: opensAccount,
    tokenAccountClosed: closesAccount,
    slot: quote.contextSlot,
  };
  logJournal({
    sessionId: args.sessionId,
    kind: "swap",
    summary: `Swap ${result.sold} → ${result.received}`,
    reasoning: args.reasoning,
    details: { inputMint, outputMint, ...result },
  });
  await recordSolanaSwap({
    inputMint,
    outputMint,
    inputSymbol: inInfo.symbol,
    outputSymbol: outInfo.symbol,
    inAmount: args.amount,
    outAmount,
    meta: args.meta,
  }).catch((err) => console.error(`No se pudo registrar la posición: ${(err as Error).message}`));
  return result;
}

export async function quoteSolana(input: string, output: string, amount: number, slippageBps = 50) {
  const inputMint = resolveMint(input);
  const outputMint = resolveMint(output);
  const [inInfo, outInfo] = await Promise.all([getTokenInfo(inputMint), getTokenInfo(outputMint)]);
  const quote = await getQuote(inputMint, outputMint, toBaseUnits(amount, inInfo.decimals), slippageBps);
  const outAmount = fromBaseUnits(quote.outAmount, outInfo.decimals);
  return {
    input: `${amount} ${inInfo.symbol} (${inputMint})`,
    output: `${outAmount} ${outInfo.symbol} (${outputMint})`,
    jupiterPriceImpact: quote.priceImpactPct,
    route: quote.routePlan.map((r) => `${r.swapInfo.label ?? r.swapInfo.ammKey} (${r.percent}%)`),
  };
}

// ─── Órdenes de mercado en Binance ──────────────────────────────────────────

export async function binanceMarketOrder(args: {
  sessionId: number | null;
  symbol: string;
  side: "BUY" | "SELL";
  amount: number; // BUY: cantidad de quote a gastar. SELL: cantidad base a vender.
  reasoning: string;
  meta?: TradeMeta;
}) {
  const info = await binance.getSymbolInfo(args.symbol);
  const book = await binance.getOrderBook(info.symbol);
  const fee = config.binanceTakerFee;

  let fill: binance.MarketFill;
  if (args.side === "BUY") {
    const have = balance("binance", info.quoteAsset);
    if (args.amount > have + DUST) throw new Error(`Saldo insuficiente: tienes ${have} ${info.quoteAsset} en Binance`);
    fill = binance.walkBook(book.asks, "BUY", args.amount);
  } else {
    const qty = binance.roundDownToStep(args.amount, info.stepSize);
    const have = balance("binance", info.baseAsset);
    if (qty > have + DUST) throw new Error(`Saldo insuficiente: tienes ${have} ${info.baseAsset} en Binance`);
    if (qty <= 0) throw new Error(`Cantidad menor que el mínimo (stepSize ${info.stepSize})`);
    fill = binance.walkBook(book.bids, "SELL", qty);
  }
  if (fill.quoteQty < info.minNotional) {
    throw new Error(`Orden rechazada: el importe mínimo en ${info.symbol} es ${info.minNotional} ${info.quoteAsset}`);
  }

  // La comisión taker se descuenta del activo recibido.
  const feePaid = args.side === "BUY" ? fill.baseQty * fee : fill.quoteQty * fee;
  applyAtomically(() => {
    if (args.side === "BUY") {
      adjust("binance", info.quoteAsset, info.quoteAsset, 8, -fill.quoteQty);
      adjust("binance", info.baseAsset, info.baseAsset, 8, fill.baseQty - feePaid);
    } else {
      adjust("binance", info.baseAsset, info.baseAsset, 8, -fill.baseQty);
      adjust("binance", info.quoteAsset, info.quoteAsset, 8, fill.quoteQty - feePaid);
    }
  });

  const result = {
    symbol: info.symbol,
    side: args.side,
    baseQty: fill.baseQty,
    quoteQty: fill.quoteQty,
    avgPrice: fill.avgPrice,
    bestPrice: fill.bestPrice,
    slippagePct: fill.slippagePct,
    fee: `${feePaid} ${args.side === "BUY" ? info.baseAsset : info.quoteAsset}`,
  };
  logJournal({
    sessionId: args.sessionId,
    kind: "cex_order",
    summary: `Binance ${args.side} ${fill.baseQty.toPrecision(6)} ${info.baseAsset} @ ${fill.avgPrice.toPrecision(6)} ${info.quoteAsset}`,
    reasoning: args.reasoning,
    details: result,
  });
  await recordBinanceTrade({
    baseAsset: info.baseAsset,
    quoteAsset: info.quoteAsset,
    side: args.side,
    baseQty: fill.baseQty,
    quoteQty: fill.quoteQty,
    fee: feePaid,
    meta: args.meta,
  }).catch((err) => console.error(`No se pudo registrar la posición: ${(err as Error).message}`));
  return result;
}

// ─── Transferencias entre el monedero de Solana y Binance ────────────────────

export async function transfer(args: {
  sessionId: number | null;
  asset: "USDC" | "SOL";
  from: Venue;
  amount: number;
  reasoning: string;
}) {
  if (!(args.amount > 0)) throw new Error("La cantidad debe ser positiva");
  const mint = args.asset === "SOL" ? SOL_MINT : USDC_MINT;
  const decimals = args.asset === "SOL" ? 9 : 6;
  let received: number;
  let feeText: string;

  applyAtomically(() => {
    if (args.from === "solana") {
      // Envío on-chain a la dirección de depósito de Binance: se paga la fee de red en SOL.
      adjust("solana", mint, args.asset, decimals, -args.amount);
      adjust("solana", SOL_MINT, "SOL", 9, -config.solanaTxFeeSol);
      received = args.amount;
      adjust("binance", args.asset, args.asset, 8, received);
      feeText = `${config.solanaTxFeeSol} SOL (red)`;
    } else {
      const withdrawFee = BINANCE_WITHDRAW_FEES[args.asset];
      if (args.amount <= withdrawFee) throw new Error(`La retirada mínima debe superar la comisión de ${withdrawFee} ${args.asset}`);
      adjust("binance", args.asset, args.asset, 8, -args.amount);
      received = args.amount - withdrawFee;
      adjust("solana", mint, args.asset, decimals, received);
      feeText = `${withdrawFee} ${args.asset} (retirada Binance)`;
    }
  });

  const result = { asset: args.asset, from: args.from, to: args.from === "solana" ? "binance" : "solana", sent: args.amount, received: received!, fee: feeText! };
  logJournal({
    sessionId: args.sessionId,
    kind: "transfer",
    summary: `Transferencia ${args.amount} ${args.asset} ${result.from} → ${result.to}`,
    reasoning: args.reasoning,
    details: result,
  });
  return result;
}

// ─── Valoración a precio de mercado ─────────────────────────────────────────

const STABLES = new Set(["USDT", "USDC", "FDUSD"]);

async function valueHolding(h: Holding): Promise<{ usd: number; method: string }> {
  if (h.venue === "solana") {
    if (h.asset === USDC_MINT) return { usd: h.amount, method: "stable" };
    try {
      // Valor de liquidación: cuánto USDC darían hoy vendiéndolo todo.
      const q = await getQuote(h.asset, USDC_MINT, toBaseUnits(h.amount, h.decimals), 100);
      return { usd: fromBaseUnits(q.outAmount, 6), method: "liquidación Jupiter" };
    } catch {
      const info = await getTokenInfo(h.asset).catch(() => null);
      return { usd: (info?.usdPrice ?? 0) * h.amount, method: "precio spot (sin ruta de venta)" };
    }
  }
  if (STABLES.has(h.asset)) return { usd: h.amount, method: "stable" };
  for (const quoteAsset of ["USDT", "USDC"]) {
    try {
      const book = await binance.getOrderBook(`${h.asset}${quoteAsset}`);
      const fill = binance.walkBook(book.bids, "SELL", h.amount);
      return { usd: fill.quoteQty * (1 - config.binanceTakerFee), method: `liquidación Binance ${h.asset}${quoteAsset}` };
    } catch {
      /* se prueba el siguiente par */
    }
  }
  return { usd: 0, method: "sin precio" };
}

export async function valuation(recordSnapshot = false) {
  const holdings = getHoldings();
  const lines = await Promise.all(
    holdings.map(async (h) => ({ ...h, ...(await valueHolding(h)) })),
  );
  const totalUsd = lines.reduce((s, l) => s + l.usd, 0);
  const initialUsd = Number(getMeta("initial_usd") ?? config.initialUsd);
  const benchSolPrice = Number(getMeta("benchmark_sol_price"));
  const benchmarkUsd = benchSolPrice ? (initialUsd / benchSolPrice) * (await solUsdPrice()) : initialUsd;

  if (recordSnapshot) {
    db.prepare("INSERT INTO snapshots (ts, total_usd, benchmark_usd, details) VALUES (?, ?, ?, ?)").run(
      now(),
      totalUsd,
      benchmarkUsd,
      JSON.stringify(lines.map((l) => ({ venue: l.venue, symbol: l.symbol, amount: l.amount, usd: l.usd }))),
    );
  }
  return {
    startedAt: getMeta("start_ts"),
    initialUsd,
    totalUsd,
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
