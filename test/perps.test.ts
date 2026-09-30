// Futuros perpetuos simulados: apertura, valoración, cierre con ganancia, take profit y liquidación.
import assert from "node:assert/strict";
import { test } from "node:test";
import { db } from "../src/db.js";
import { USDC_MINT, SOL_MINT } from "../src/market/jupiter.js";
import { createMission } from "../src/sim/mission.js";
import { checkPerps, closePerp, openPerp, setPerpExits, PERP_DEPOSIT_FEE_USD, PERP_TAKER_FEE, PERP_WITHDRAW_FEE_USD } from "../src/sim/perps.js";
import { getHoldings, valuation } from "../src/sim/portfolio.js";
import { listPositions } from "../src/sim/positions.js";
import { installFakeMarket, setPrice } from "./fake-market.js";

installFakeMarket();

const m = (await createMission(1000, 1200, 60, undefined, { solana: 100 })).id;
const usdc = () => getHoldings(m).find((h) => h.asset === USDC_MINT)?.amount ?? 0;
const close = (a: number, b: number, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test("abrir un largo: el margen sale del efectivo y la posición cuenta en la cartera", async () => {
  setPrice(SOL_MINT, 150);
  const before = usdc();
  const r = await openPerp({ missionId: m, sessionId: null, coin: "sol", side: "long", leverage: 10, marginUsd: 20, reasoning: "test" });
  close(usdc(), before - 20 - PERP_DEPOSIT_FEE_USD);
  assert.equal(r.entryPrice, 150);
  close(r.notionalUsd, 200);
  // Liquidación de un largo 10x con mantenimiento de 1/(2·20): 1/10 − 1/40 ≈ 7,5 % por debajo.
  assert.ok(r.liquidationPrice > 138 && r.liquidationPrice < 139, String(r.liquidationPrice));
  const v = await valuation(m);
  assert.equal(v.perps?.length, 1);
  close(v.perps![0]!.valueIfClosedUsd, 20 - 2 * 200 * PERP_TAKER_FEE - PERP_WITHDRAW_FEE_USD, 0.05);
});

test("cerrar con el precio un 5 % arriba: a 10x, un +50 % sobre el margen (menos costes)", async () => {
  setPrice(SOL_MINT, 157.5);
  const id = (db.prepare("SELECT id FROM perp_positions WHERE mission_id = ? AND status = 'open'").get(m) as { id: number }).id;
  const before = usdc();
  const r = await closePerp({ missionId: m, sessionId: null, perpId: id, reasoning: "test" });
  // 20 de margen + 10 de beneficio − comisiones (≈0,18) − funding (casi 0) − retirada (1).
  assert.ok(r.returnedUsd > 28.7 && r.returnedUsd < 29, String(r.returnedUsd));
  close(usdc(), before + r.returnedUsd);
  const p = listPositions(m).find((x) => x.venue === "hyperliquid")!;
  assert.equal(p.status, "closed");
  assert.ok(p.pnlPct! > 35, String(p.pnlPct));
});

test("take profit y liquidación los vigila el simulador", async () => {
  setPrice(SOL_MINT, 150);
  await openPerp({ missionId: m, sessionId: null, coin: "SOL", side: "short", leverage: 5, marginUsd: 10, takeProfit: 140, reasoning: "tp" });
  await openPerp({ missionId: m, sessionId: null, coin: "SOL", side: "long", leverage: 20, marginUsd: 10, reasoning: "liq" });
  setPrice(SOL_MINT, 139);
  const log = (await checkPerps()).join("\n");
  assert.match(log, /take profit/);
  assert.match(log, /liquidado/);
  const rows = db.prepare("SELECT side, status, returned_usd FROM perp_positions WHERE mission_id = ? AND reasoning IN ('tp', 'liq') ORDER BY id").all(m) as Array<{ side: string; status: string; returned_usd: number }>;
  assert.deepEqual(rows.map((r) => [r.side, r.status]), [["short", "closed"], ["long", "liquidated"]]);
  assert.equal(rows[1]!.returned_usd, 0);
  assert.ok(rows[0]!.returned_usd > 10, "el corto ganó");
});

test("límites: apalancamiento máximo por moneda y mínimo de nocional", async () => {
  await assert.rejects(openPerp({ missionId: m, sessionId: null, coin: "BNB", side: "long", leverage: 20, marginUsd: 10, reasoning: "x" }), /entre 1 y 10x/);
  await assert.rejects(openPerp({ missionId: m, sessionId: null, coin: "SOL", side: "long", leverage: 2, marginUsd: 4, reasoning: "x" }), /al menos 10 \$/);
  await assert.rejects(openPerp({ missionId: m, sessionId: null, coin: "DOGEX", side: "long", leverage: 2, marginUsd: 10, reasoning: "x" }), /no tiene un perpetuo/);
});

test("las salidas se pueden poner después de abrir, con el precio de entrada real, y se vigilan igual", async () => {
  setPrice(SOL_MINT, 150);
  const r = await openPerp({ missionId: m, sessionId: null, coin: "SOL", side: "long", leverage: 5, marginUsd: 10, reasoning: "exits" });
  await assert.rejects(setPerpExits({ missionId: m, sessionId: null, perpId: r.perpId, takeProfit: 149, reasoning: "x" }), /por encima/);
  await assert.rejects(setPerpExits({ missionId: m, sessionId: null, perpId: r.perpId, stopLoss: 151, reasoning: "x" }), /por debajo/);
  const set = await setPerpExits({ missionId: m, sessionId: null, perpId: r.perpId, takeProfit: 155, stopLoss: 145, reasoning: "tras abrir" });
  assert.deepEqual([set.takeProfit, set.stopLoss], [155, 145]);
  // 0 quita solo esa salida; la otra se queda.
  const cleared = await setPerpExits({ missionId: m, sessionId: null, perpId: r.perpId, stopLoss: 0, reasoning: "sin stop" });
  assert.deepEqual([cleared.takeProfit, cleared.stopLoss], [155, null]);
  setPrice(SOL_MINT, 156);
  assert.match((await checkPerps()).join(" "), /take profit/i);
  const row = db.prepare("SELECT status FROM perp_positions WHERE id = ?").get(r.perpId) as { status: string };
  assert.equal(row.status, "closed");
});

test("un futuro guarda los mismos datos de decisión que un swap, y una creencia puede acotarlos", async () => {
  const mm = (await createMission(1000, 5000, 60, undefined, { solana: 100 })).id;
  await openPerp({ missionId: mm, sessionId: null, coin: "SOL", side: "long", leverage: 20, marginUsd: 100, reasoning: "test" });
  const p = listPositions(mm).find((x) => x.venue === "hyperliquid")!;
  const r = p.research as Record<string, number>;
  assert.ok(r.minutesLeft >= 59 && r.minutesLeft <= 60, String(r.minutesLeft));
  assert.ok(r.portfolioPct >= 9 && r.portfolioPct <= 11, String(r.portfolioPct));
  assert.equal(typeof r.hourUtc, "number");
  // Cuenta los largos de SOL ya cerrados en los tests anteriores: volver a la misma moneda y sentido se mide.
  const before = db.prepare("SELECT COUNT(*) AS n FROM positions WHERE venue = 'hyperliquid' AND asset = 'SOL-PERP-long' AND status = 'closed'").get() as { n: number };
  assert.equal(r.previousTradesInToken, before.n);
  const memory = await import("../src/sim/memory.js");
  assert.ok(memory.matches({ all: [{ f: "venue", op: "=", v: "hyperliquid" }, { f: "leverage", op: ">=", v: 20 }, { f: "minutesLeft", op: ">", v: 12 }] }, p));
  assert.ok(!memory.matches({ all: [{ f: "venue", op: "=", v: "hyperliquid" }, { f: "minutesLeft", op: "<=", v: 12 }] }, p));
});
