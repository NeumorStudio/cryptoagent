// Reglas puras de cada venue: qué cambia en el monedero al ejecutar una operación.
import assert from "node:assert/strict";
import { test } from "node:test";
import { config } from "../src/config.js";
import { SOL_MINT, USDC_MINT } from "../src/market/jupiter.js";
import { fillMarketOrder } from "../src/sim/venues/binance.js";
import { settleSolanaSwap, TOKEN_ACCOUNT_RENT_SOL } from "../src/sim/venues/solana.js";
import type { SwapQuote } from "../src/sim/venues/types.js";

const SOL = { address: SOL_MINT, symbol: "SOL", decimals: 9 };
const USDC = { address: USDC_MINT, symbol: "USDC", decimals: 6 };
const MEME = { address: "Meme", symbol: "MEME", decimals: 6 };

const quote = (input: typeof SOL, output: typeof SOL, amountIn: number, amountOut: number): SwapQuote => ({
  chain: "solana",
  input,
  output,
  amountIn,
  grossOut: amountOut,
  amountOut,
  route: [],
  slippageBps: 50,
  warnings: [],
});
const wallet = (balances: Record<string, number>) => ({ balance: (a: string) => balances[a] ?? 0 });
const delta = (s: ReturnType<typeof settleSolanaSwap>, asset: string) => (s.ok ? s.deltas.filter((d) => d.asset === asset).reduce((t, d) => t + d.amount, 0) : NaN);

test("Solana: comprar un token nuevo paga la fee y la renta de su cuenta", () => {
  const s = settleSolanaSwap(quote(USDC, MEME, 100, 9000), wallet({ [USDC_MINT]: 500, [SOL_MINT]: 0.05 }));
  assert.ok(s.ok);
  assert.equal(delta(s, USDC_MINT), -100);
  assert.equal(delta(s, "Meme"), 9000);
  assert.ok(Math.abs(delta(s, SOL_MINT) + config.solanaTxFeeSol + TOKEN_ACCOUNT_RENT_SOL) < 1e-12);
  assert.equal(s.info.tokenAccountOpened, true);
  assert.equal(s.info.tokenAccountClosed, false);
});

test("Solana: vender todo un token recupera la renta de su cuenta", () => {
  const s = settleSolanaSwap(quote(MEME, USDC, 9000, 110), wallet({ Meme: 9000, [USDC_MINT]: 1, [SOL_MINT]: 0.01 }));
  assert.ok(s.ok);
  assert.ok(Math.abs(delta(s, SOL_MINT) - (TOKEN_ACCOUNT_RENT_SOL - config.solanaTxFeeSol)) < 1e-12);
  assert.equal(s.info.tokenAccountClosed, true);
  assert.equal(s.info.tokenAccountOpened, false);
});

test("Solana: sin SOL para la red, la operación no se hace", () => {
  const s = settleSolanaSwap(quote(USDC, MEME, 100, 9000), wallet({ [USDC_MINT]: 500, [SOL_MINT]: 0.001 }));
  assert.equal(s.ok, false);
  assert.match(s.ok ? "" : s.error, /SOL insuficiente/);
  assert.deepEqual(s.deltas, []);
});

test("Solana: vender más de lo que tienes", () => {
  const s = settleSolanaSwap(quote(MEME, USDC, 10, 1), wallet({ Meme: 5, [SOL_MINT]: 1 }));
  assert.equal(s.ok, false);
  assert.match(s.ok ? "" : s.error, /Saldo insuficiente/);
});

test("Solana: comprar SOL con USDC puede pagarse con el propio SOL recibido", () => {
  const s = settleSolanaSwap(quote(USDC, SOL, 15, 0.1), wallet({ [USDC_MINT]: 15 }));
  assert.ok(s.ok);
  assert.ok(Math.abs(delta(s, SOL_MINT) - (0.1 - config.solanaTxFeeSol + TOKEN_ACCOUNT_RENT_SOL)) < 1e-12);
});

const info = { symbol: "SOLUSDT", baseAsset: "SOL", quoteAsset: "USDT", stepSize: 0.001, minNotional: 5 };
const book = { bids: [[149.99, 100]] as [number, number][], asks: [[150.01, 100]] as [number, number][] };

test("Binance: compra con comisión en el activo recibido", () => {
  const r = fillMarketOrder({ info, book, side: "BUY", amount: 150.01, balance: () => 1000, takerFee: 0.001 });
  assert.ok(Math.abs(r.fill.baseQty - 1) < 1e-12);
  assert.equal(r.feeAsset, "SOL");
  assert.deepEqual(
    r.deltas.map((d) => [d.asset, Number(d.amount.toFixed(9))]),
    [
      ["USDT", -150.01],
      ["SOL", 0.999],
    ],
  );
});

test("Binance: venta redondeada al step y mínimo nocional", () => {
  const r = fillMarketOrder({ info, book, side: "SELL", amount: 1.23456, balance: () => 2, takerFee: 0.001 });
  assert.equal(r.fill.baseQty, 1.234);
  assert.equal(r.feeAsset, "USDT");
  assert.throws(() => fillMarketOrder({ info, book, side: "SELL", amount: 0.01, balance: () => 2, takerFee: 0.001 }), /importe mínimo/);
  assert.throws(() => fillMarketOrder({ info, book, side: "SELL", amount: 3, balance: () => 2, takerFee: 0.001 }), /Saldo insuficiente/);
});
