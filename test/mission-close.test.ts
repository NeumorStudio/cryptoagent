import assert from "node:assert/strict";
import { test } from "node:test";
import { db } from "../src/db.js";
import { USDC_MINT } from "../src/market/jupiter.js";
import { checkMission, createMission, getMission } from "../src/sim/mission.js";
import { valuation } from "../src/sim/portfolio.js";
import { installFakeMarket } from "./fake-market.js";

installFakeMarket();

test("un token sin ruta de venta vale 0 y no impide cerrar una misión que ya tiene el objetivo en efectivo", async () => {
  const m = await createMission(100, 105, 60, undefined, { solana: 100 });
  const RUG = "RuG1111111111111111111111111111111111111pump";
  db.prepare("UPDATE holdings SET amount = 110 WHERE mission_id = ? AND venue = 'solana' AND asset = ?").run(m.id, USDC_MINT);
  db.prepare("INSERT INTO holdings (mission_id, venue, asset, symbol, decimals, amount) VALUES (?, 'solana', ?, 'RUG', 6, 1000000)").run(m.id, RUG);

  const v = await valuation(m.id);
  const rug = v.holdings.find((h) => h.asset === RUG)!;
  assert.equal(rug.usd, 0);
  assert.match(rug.valuedBy, /sin ruta de venta/);
  assert.equal(v.reliable, true);

  const log = await checkMission(m.id);
  assert.match(log.join("\n"), /CONSEGUIDA/);
  assert.equal(getMission(m.id)!.status, "succeeded");
});

test("sin cierre al objetivo: tocarlo no termina la misión; al final del plazo cuenta si vale el objetivo o más", async () => {
  const setUsdc = (id: number, usd: number) => db.prepare("UPDATE holdings SET amount = ? WHERE mission_id = ? AND venue = 'solana' AND asset = ?").run(usd, id, USDC_MINT);
  const expire = (id: number) => db.prepare("UPDATE missions SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), id);

  const up = await createMission(100, 105, 60, undefined, { solana: 100 }, { closeOnTarget: false });
  setUsdc(up.id, 110);
  assert.deepEqual(await checkMission(up.id), [], "por encima del objetivo, pero con plazo: sigue");
  assert.equal(getMission(up.id)!.status, "active");
  expire(up.id);
  const log = await checkMission(up.id);
  assert.match(log.join("\n"), /CONSEGUIDA.*\(\+\d+\.\d %; objetivo 105 USD\)/);
  assert.equal(getMission(up.id)!.status, "succeeded");

  const down = await createMission(100, 105, 60, undefined, { solana: 100 }, { closeOnTarget: false });
  setUsdc(down.id, 90);
  expire(down.id);
  assert.match((await checkMission(down.id)).join("\n"), /TERMINADA POR TIEMPO.*\(-\d+\.\d %/);
  assert.equal(getMission(down.id)!.status, "expired");
});

test("sin objetivo: no hay meta ni cierre al llegar; termina por tiempo y cuenta el rendimiento, sin contarse como conseguida", async () => {
  const { missionStatus } = await import("../src/sim/mission.js");
  const setUsdc = (id: number, usd: number) => db.prepare("UPDATE holdings SET amount = ? WHERE mission_id = ? AND venue = 'solana' AND asset = ?").run(usd, id, USDC_MINT);
  const m = await createMission(40, null, 30, undefined, { solana: 100 });
  assert.equal(m.open_target, 1);
  assert.equal(m.close_on_target, 0);
  setUsdc(m.id, 60);
  const st = (await missionStatus(m.id)) as Record<string, unknown>;
  assert.match(String(st.goal), /SIN OBJETIVO/);
  assert.equal(st.targetUsd, undefined);
  assert.equal(st.progressPct, undefined);
  assert.deepEqual(await checkMission(m.id), [], "ganando mucho, pero sin objetivo: sigue hasta el plazo");
  db.prepare("UPDATE missions SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), m.id);
  assert.match((await checkMission(m.id)).join("\n"), /TERMINADA POR TIEMPO.*\(\+\d+\.\d %; sin objetivo\)/);
  assert.equal(getMission(m.id)!.status, "expired");
});

test("gestión de la cartera: la curva de valor da pico, caída y lo devuelto; cada entrada guarda cómo iba la misión", async () => {
  const { equityCurve } = await import("../src/sim/memory.js");
  const { missionPathAtEntry } = await import("../src/sim/positions.js");
  const m = await createMission(100, null, 60, undefined, { solana: 100 });
  const t0 = Date.now();
  const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
  db.prepare("UPDATE missions SET started_at = ? WHERE id = ?").run(at(0), m.id);
  const point = db.prepare("INSERT INTO snapshots (ts, mission_id, total_usd, benchmark_usd) VALUES (?, ?, ?, ?)");
  for (const [min, v] of [[1, 100], [5, 140], [10, 120], [15, 110]] as const) point.run(at(min), m.id, v, 100);
  const e = equityCurve(m.id)!;
  assert.equal(e.peakPct, 40);
  assert.equal(e.peakAtMinute, 5);
  assert.equal(e.resultPct, 10);
  assert.equal(e.givebackPct, 75, "ganó 40 en el pico y se quedó con 10: devolvió el 75 %");
  assert.equal(e.maxDrawdownPct, -21.4);
  const path = missionPathAtEntry(m.id, at(16));
  assert.equal(path.missionPeakPnlPctAtEntry, 40);
  assert.equal(path.drawdownFromPeakPctAtEntry, -21.4);
});
