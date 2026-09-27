// Depósitos y retiradas de Binance por cada red, y puentes entre cadenas, contra el mercado falso.
import assert from "node:assert/strict";
import { test } from "node:test";
import { takeBudget } from "../src/market/http.js";
import { USDC_MINT } from "../src/market/jupiter.js";
import { createMission } from "../src/sim/mission.js";
import { getHoldings, valuation } from "../src/sim/portfolio.js";
import { listPositions } from "../src/sim/positions.js";
import { bridge, cexTransfer, settleTransfers, solanaAddress } from "../src/sim/transfers.js";
import { BASE_USDC, BSC_USDT, CAKE, installFakeMarket, NATIVE } from "./fake-market.js";

installFakeMarket();

const mission = await createMission(1000, 5000, 60);
const m = mission.id;
const bal = (venue: string, asset: string) => getHoldings(m).find((h) => h.venue === venue && h.asset === asset)?.amount ?? 0;
const base = { missionId: m, sessionId: null, reasoning: "test" };

test("dirección de Solana ficticia: base58 de 32 bytes", () => {
  assert.match(solanaAddress(m), /^[1-9A-HJ-NP-Za-km-z]{43,44}$/);
  assert.equal(solanaAddress(m), solanaAddress(m));
});

test("depositar USDC de Base en Binance: gas en ETH y llega en unos minutos", async () => {
  const eth = bal("base", NATIVE);
  const r = await cexTransfer({ ...base, asset: "USDC", from: "base", to: "binance", amount: 50 });
  assert.equal(r.network, "BASE");
  assert.ok(bal("base", NATIVE) < eth, "gas del envío");
  assert.equal(bal("binance", "USDC"), 0);
  assert.ok(new Date(r.arrivesAt).getTime() > Date.now() + 60_000);
  await settleTransfers({ missionId: m, force: true });
  assert.equal(bal("binance", "USDC"), 50);
});

test("retirar USDT de Binance a BNB Chain: comisión y mínimo de Binance", async () => {
  const before = bal("bsc", BSC_USDT);
  const r = await cexTransfer({ ...base, asset: "USDT", from: "binance", to: "bsc", amount: 20 });
  assert.equal(r.willReceive, 20 - 0.01);
  await settleTransfers({ missionId: m, force: true });
  assert.ok(Math.abs(bal("bsc", BSC_USDT) - before - 19.99) < 1e-9);
});

test("puente USDC de Solana → USDT de BNB Chain con Li.Fi: en tránsito hasta que llega", async () => {
  const usdc = bal("solana", USDC_MINT);
  const usdt = bal("bsc", BSC_USDT);
  const r = await bridge({ ...base, fromChain: "solana", toChain: "bsc", tokenIn: "USDC", tokenOut: "USDT", amount: 30, slippageBps: 50 });
  assert.match(r.bridge, /Li\.Fi \(fakebridge\)/);
  assert.equal(bal("solana", USDC_MINT), usdc - 30);
  const v = await valuation(m);
  assert.equal(v.inTransit?.length, 1);
  assert.ok(Math.abs(v.inTransit![0]!.usd - 29.95) < 1e-6);
  await settleTransfers({ missionId: m, force: true });
  assert.ok(Math.abs(bal("bsc", BSC_USDT) - usdt - 29.95) < 1e-9);
});

test("puente cambiando de token: la posición se abre al llegar", async () => {
  await bridge({ ...base, fromChain: "base", toChain: "bsc", tokenIn: "USDC", tokenOut: CAKE, amount: 20.05, slippageBps: 50 });
  assert.equal(listPositions(m).find((p) => p.asset === CAKE), undefined);
  await settleTransfers({ missionId: m, force: true });
  const p = listPositions(m).find((x) => x.asset === CAKE)!;
  assert.equal(p.status, "open");
  assert.ok(Math.abs(bal("bsc", CAKE) - 10) < 1e-9, "20 $ a 2 $ el CAKE");
  assert.equal(p.entry.venue, "bsc");
});

test("sin cupo de Li.Fi, el puente usa una estimación", async () => {
  for (let i = 0; i < 80; i++) takeBudget("li.quest", 1_000, 2 * 60 * 60_000);
  const r = await bridge({ ...base, fromChain: "base", toChain: "bsc", tokenIn: "USDC", tokenOut: "USDT", amount: 10, slippageBps: 50 });
  assert.match(r.bridge, /estimación/);
  assert.ok(r.warning);
});

test("un puente dentro de la misma cadena no tiene sentido", async () => {
  await assert.rejects(bridge({ ...base, fromChain: "base", toChain: "base", tokenIn: "USDC", tokenOut: "ETH", amount: 1, slippageBps: 50 }), /simulate_swap/);
});

test("valoración: el tránsito cuenta y la cartera se conserva (menos costes)", async () => {
  const v = await valuation(m);
  assert.ok(v.totalUsd > 990 && v.totalUsd < 1000, `${v.totalUsd}`);
  assert.ok(bal("base", BASE_USDC) > 0);
});
