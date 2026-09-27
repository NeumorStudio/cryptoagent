// Base y BNB Chain: reglas del monedero (gas, approvals, impuestos, honeypots), reparto inicial
// y un recorrido completo contra el mercado falso.
import assert from "node:assert/strict";
import { test } from "node:test";
import { db } from "../src/db.js";
import { SOL_MINT, USDC_MINT } from "../src/market/jupiter.js";
import { createMission } from "../src/sim/mission.js";
import { getHoldings, liquidateAll, planPortfolio, swap, valuation } from "../src/sim/portfolio.js";
import { listPositions } from "../src/sim/positions.js";
import { settleEvmSwap, type EvmQuoteExtra } from "../src/sim/venues/evm.js";
import type { SwapQuote, TokenRef } from "../src/sim/venues/types.js";
import { BASE_USDC, BSC_USDT, CAKE, HONEY, installFakeMarket, NATIVE, TAXED } from "./fake-market.js";

installFakeMarket();

// ─── Reglas puras ───────────────────────────────────────────────────────────

const ETH: TokenRef = { address: NATIVE, symbol: "ETH", decimals: 18 };
const USDC: TokenRef = { address: BASE_USDC, symbol: "USDC", decimals: 6 };
const TOK: TokenRef = { address: TAXED, symbol: "TAX", decimals: 18 };
const GAS = 0.000002;
const APPROVE = 0.0000005;

function q(input: TokenRef, output: TokenRef, amountIn: number, grossOut: number, x: Partial<EvmQuoteExtra> = {}, slippageBps = 50): SwapQuote {
  const extra: EvmQuoteExtra = { source: "test", gasNative: GAS, l1Native: 0, approvalGasNative: APPROVE, honeypotSell: false, ...x };
  const tax = (1 - (extra.sellTaxPct ?? 0) / 100) * (1 - (extra.buyTaxPct ?? 0) / 100);
  return { chain: "base", input, output, amountIn, grossOut, amountOut: grossOut * tax, route: [], slippageBps, extra: extra as never, warnings: [] };
}
const wallet = (balances: Record<string, number>, approved: string[] = []) => ({
  balance: (a: string) => balances[a] ?? 0,
  approved: (a: string) => approved.includes(a),
});
const nativeDelta = (s: ReturnType<typeof settleEvmSwap>) => s.deltas.filter((d) => d.asset === NATIVE).reduce((t, d) => t + d.amount, 0);

test("EVM: la primera venta de un token paga el approve; las siguientes, no", () => {
  const first = settleEvmSwap(q(USDC, TOK, 10, 20), wallet({ [BASE_USDC]: 100, [NATIVE]: 0.01 }));
  assert.ok(first.ok);
  assert.deepEqual(first.approvals, [BASE_USDC]);
  assert.ok(Math.abs(nativeDelta(first) + GAS + APPROVE) < 1e-15);
  const again = settleEvmSwap(q(USDC, TOK, 10, 20), wallet({ [BASE_USDC]: 100, [NATIVE]: 0.01 }, [BASE_USDC]));
  assert.ok(again.ok);
  assert.deepEqual(again.approvals, []);
  assert.ok(Math.abs(nativeDelta(again) + GAS) < 1e-15);
});

test("EVM: sin nativo para el gas la transacción no sale (y no cuesta nada)", () => {
  const s = settleEvmSwap(q(USDC, TOK, 10, 20), wallet({ [BASE_USDC]: 100, [NATIVE]: 0.000001 }));
  assert.equal(s.ok, false);
  assert.match(s.ok ? "" : s.error, /insufficient funds for gas \* price \+ value/);
  assert.deepEqual(s.deltas, []);
});

test("EVM: al vender el nativo hace falta cubrir lo enviado más el gas", () => {
  const s = settleEvmSwap(q(ETH, USDC, 0.01, 30), wallet({ [NATIVE]: 0.01 }));
  assert.equal(s.ok, false);
  const ok = settleEvmSwap(q(ETH, USDC, 0.009, 27), wallet({ [NATIVE]: 0.01 }));
  assert.ok(ok.ok);
  assert.deepEqual(ok.approvals, [], "el nativo no necesita approve");
  assert.ok(Math.abs(nativeDelta(ok) + 0.009 + GAS) < 1e-15);
});

test("EVM: si los impuestos superan el slippage, revierte y se pierde el gas", () => {
  const s = settleEvmSwap(q(USDC, TOK, 10, 20, { buyTaxPct: 5 }, 100), wallet({ [BASE_USDC]: 100, [NATIVE]: 0.01 }));
  assert.equal(s.ok, false);
  assert.match(s.ok ? "" : s.error, /revierte.*impuestos/);
  assert.ok(Math.abs(nativeDelta(s) + GAS + APPROVE) < 1e-15);
  assert.deepEqual(s.approvals, [BASE_USDC], "el approve ya se hizo");
  const ok = settleEvmSwap(q(USDC, TOK, 10, 20, { buyTaxPct: 5 }, 600), wallet({ [BASE_USDC]: 100, [NATIVE]: 0.01 }));
  assert.ok(ok.ok);
  assert.equal(ok.deltas.find((d) => d.asset === TAXED)!.amount, 19);
});

test("EVM: un honeypot no se puede vender", () => {
  const s = settleEvmSwap(q(TOK, USDC, 10, 5, { honeypotSell: true }, 5000), wallet({ [TAXED]: 10, [NATIVE]: 0.01 }));
  assert.equal(s.ok, false);
  assert.match(s.ok ? "" : s.error, /honeypot/);
  assert.ok(nativeDelta(s) < 0);
});

// ─── Reparto inicial ────────────────────────────────────────────────────────

const PRICES = { solana: 150, base: 3000, bsc: 600 };

test("reparto: suma el capital, con una parte en nativo para el gas de cada cadena", () => {
  const h = planPortfolio(1000, { solana: 30, base: 25, bsc: 25, binance: 20 }, PRICES);
  const usd = (x: (typeof h)[number]) => x.amount * (x.asset === SOL_MINT ? 150 : x.venue === "base" && x.asset === NATIVE ? 3000 : x.venue === "bsc" && x.asset === NATIVE ? 600 : 1);
  assert.ok(Math.abs(h.reduce((t, x) => t + usd(x), 0) - 1000) < 1e-6);
  // 3 % de 300 $ = 9 $, por encima del máximo de Solana (7,5 $): 0,05 SOL.
  assert.equal(h.find((x) => x.asset === SOL_MINT)!.amount, 0.05);
  // 3 % de 250 $ = 7,5 $, por encima del máximo de Base (3 $): 0,001 ETH.
  assert.equal(h.find((x) => x.venue === "base" && x.asset === NATIVE)!.amount, 0.001);
  assert.deepEqual(h.find((x) => x.venue === "binance"), { venue: "binance", asset: "USDT", symbol: "USDT", decimals: 8, amount: 200 });
});

test("reparto: con poco capital, el gas mínimo sin pasar de la mitad", () => {
  const h = planPortfolio(20, { solana: 100 }, PRICES);
  assert.equal(h.find((x) => x.asset === SOL_MINT)!.amount, 0.01); // 1,5 $
  assert.equal(h.find((x) => x.asset === USDC_MINT)!.amount, 18.5);
  const tiny = planPortfolio(2, { base: 100 }, PRICES);
  assert.equal(tiny.find((x) => x.asset === NATIVE)!.amount, 0.0001); // 0,3 $ (mínimo de Base)
});

test("reparto: valida sitios y porcentajes", () => {
  assert.throws(() => planPortfolio(100, { solana: 50, base: 40 }, PRICES), /suman 90/);
  assert.throws(() => planPortfolio(100, { tron: 100 } as never, PRICES), /no existe/);
});

// ─── Recorrido completo ─────────────────────────────────────────────────────

const mission = await createMission(1000, 5000, 60);
const m = mission.id;
const bal = (venue: string, asset: string) => getHoldings(m).find((h) => h.venue === venue && h.asset === asset)?.amount ?? 0;
const base = { missionId: m, sessionId: null, reasoning: "test" };

test("la misión empieza repartida en las cuatro cuentas", async () => {
  assert.deepEqual([...new Set(getHoldings(m).map((h) => h.venue))].sort(), ["base", "binance", "bsc", "solana"]);
  const v = await valuation(m);
  assert.ok(Math.abs(v.totalUsd - 1000) < 1, `${v.totalUsd}`);
  assert.equal(v.reliable, true);
  assert.match(v.evmWallet, /^0x[0-9a-f]{40}$/);
  assert.match(v.benchmarkLabel, /sin operar/);
});

test("Base: comprar un token con impuesto y poco slippage revierte y cuesta el gas", async () => {
  const eth = bal("base", NATIVE);
  const usdc = bal("base", BASE_USDC);
  await assert.rejects(swap({ ...base, chain: "base", input: "USDC", output: TAXED, amount: 100, slippageBps: 100 }), /revierte/);
  assert.equal(bal("base", BASE_USDC), usdc);
  assert.ok(bal("base", NATIVE) < eth);
  assert.ok(db.prepare("SELECT 1 FROM journal WHERE mission_id = ? AND kind = 'failed_tx'").get(m));
});

test("Base: con slippage suficiente se compra, pagando el impuesto y ya sin approve", async () => {
  const eth = bal("base", NATIVE);
  const r = await swap({ ...base, chain: "base", input: "USDC", output: TAXED, amount: 100, slippageBps: 1100 });
  assert.equal((r as Record<string, unknown>).approvalSent, false, "el approve de USDC ya se hizo en el intento anterior");
  assert.ok(Math.abs(bal("base", TAXED) - (100 / 0.5) * 0.997 * 0.95) < 1e-6);
  assert.ok(eth - bal("base", NATIVE) > 0);
  assert.equal(listPositions(m).find((p) => p.asset === TAXED)!.entry.venue, "base");
});

test("Base: vender el token paga su approve y su impuesto de venta", async () => {
  const r = await swap({ ...base, chain: "base", input: TAXED, output: "USDC", sellAll: true, slippageBps: 1100 });
  assert.equal((r as Record<string, unknown>).approvalSent, true);
  assert.equal(bal("base", TAXED), 0);
  const p = listPositions(m).find((x) => x.asset === TAXED)!;
  assert.equal(p.status, "closed");
  assert.ok(p.pnlPct! < -9, "impuestos de ida y vuelta");
});

test("Base: un honeypot se compra, vale 0 y no se puede vender", async () => {
  await swap({ ...base, chain: "base", input: "USDC", output: HONEY, amount: 10, slippageBps: 100 });
  const v = await valuation(m);
  const h = v.holdings.find((x) => x.asset === HONEY)!;
  assert.equal(h.usd, 0);
  assert.match(h.valuedBy, /honeypot/);
  await assert.rejects(swap({ ...base, chain: "base", input: HONEY, output: "USDC", sellAll: true, slippageBps: 5000 }), /honeypot/);
});

test("BNB Chain: comprar con USDT y sin BNB para el gas", async () => {
  await swap({ ...base, chain: "bsc", input: "USDT", output: CAKE, amount: 50, slippageBps: 100 });
  assert.ok(bal("bsc", CAKE) > 0);
  db.prepare("UPDATE holdings SET amount = 0.0000001 WHERE mission_id = ? AND venue = 'bsc' AND asset = ?").run(m, NATIVE);
  await assert.rejects(swap({ ...base, chain: "bsc", input: CAKE, output: "USDT", sellAll: true, slippageBps: 100 }), /insufficient funds for gas/);
  db.prepare("UPDATE holdings SET amount = 0.005 WHERE mission_id = ? AND venue = 'bsc' AND asset = ?").run(m, NATIVE);
});

test("liquidar: todo a stablecoins salvo lo invendible", async () => {
  const problems = await liquidateAll(m, null, "Cierre automático: test");
  assert.equal(problems.length, 1);
  assert.match(problems[0]!, /HONEY \(Base\)/);
  // En las cadenas EVM queda algo de nativo: la reserva para el gas menos lo que costó la última venta.
  const left = getHoldings(m).filter((h) => !["USDC", "USDT"].includes(h.symbol));
  assert.deepEqual(left.map((h) => `${h.venue}:${h.symbol}`), ["base:ETH", "base:HONEY", "bsc:BNB"]);
  assert.ok(bal("base", NATIVE) <= 0.00003);
  assert.ok(bal("bsc", NATIVE) <= 0.0002);
  assert.equal(bal("bsc", BSC_USDT) > 0, true);
});
