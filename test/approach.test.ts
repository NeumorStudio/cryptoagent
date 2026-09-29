// recentApproach: esperar con una posición abierta no cuenta como "aparcado en efectivo", aunque la última
// operación sea la propia compra (la posición se anota unos milisegundos después que el swap en el diario).
import assert from "node:assert/strict";
import { test } from "node:test";
import { db } from "../src/db.js";
import * as memory from "../src/sim/memory.js";
import { createMission } from "../src/sim/mission.js";
import { installFakeMarket } from "./fake-market.js";

installFakeMarket();

test("una compra al final que sigue abierta hasta el cierre no es quedarse parado", async () => {
  const m = await createMission(50, 55, 15, undefined, { solana: 100 });
  const t0 = Date.now() - 20 * 60_000;
  const iso = (ms: number) => new Date(ms).toISOString();
  db.prepare("UPDATE missions SET created_at = ?, started_at = ?, deadline = ? WHERE id = ?").run(iso(t0), iso(t0), iso(t0 + 15 * 60_000), m.id);
  const buyAt = t0 + 4 * 60_000;
  db.prepare("INSERT INTO journal (ts, mission_id, session_id, kind, summary, reasoning) VALUES (?, ?, NULL, 'swap', 'Swap USDC → THUMB', 'compra')").run(iso(buyAt), m.id);
  db.prepare(
    `INSERT INTO positions (mission_id, venue, asset, symbol, opened_at, closed_at, status, qty_open, cost_open_usd, realized_cost_usd, realized_proceeds_usd, entry_features, research)
     VALUES (?, 'solana', 'Thumb1', 'THUMB', ?, ?, 'closed', 0, 0, 25, 26, '{}', '{}')`,
  ).run(m.id, iso(buyAt + 5), iso(t0 + 15 * 60_000));
  db.prepare("UPDATE missions SET status = 'expired', final_usd = 27, ended_at = ? WHERE id = ?").run(iso(t0 + 15 * 60_000), m.id);
  const row = memory.recentApproach()!.perMission.find((x) => x.missionId === m.id)!;
  assert.equal(row.idleAtEndMinutes, 11);
  assert.equal(row.parkedAtEnd, false);
});

test("abrir un futuro también es operar: no cuenta como quedarse parado al final", async () => {
  const m = await createMission(50, 55, 15, undefined, { solana: 100 });
  const t0 = Date.now() - 20 * 60_000;
  const iso = (ms: number) => new Date(ms).toISOString();
  db.prepare("UPDATE missions SET created_at = ?, started_at = ?, deadline = ? WHERE id = ?").run(iso(t0), iso(t0), iso(t0 + 15 * 60_000), m.id);
  db.prepare("INSERT INTO journal (ts, mission_id, session_id, kind, summary, reasoning) VALUES (?, ?, NULL, 'swap', 'Swap SI → USDC', 'vendo')").run(iso(t0 + 7 * 60_000), m.id);
  db.prepare("INSERT INTO journal (ts, mission_id, session_id, kind, summary, reasoning) VALUES (?, ?, NULL, 'perp', 'Abre SOL-PERP largo 20x', 'último intento')").run(iso(t0 + 8 * 60_000), m.id);
  db.prepare(
    `INSERT INTO positions (mission_id, venue, asset, symbol, opened_at, closed_at, status, qty_open, cost_open_usd, realized_cost_usd, realized_proceeds_usd, entry_features, research)
     VALUES (?, 'hyperliquid', 'SOL', 'SOL-PERP largo 20x', ?, ?, 'closed', 0, 0, 40, 40, '{}', '{}')`,
  ).run(m.id, iso(t0 + 8 * 60_000 + 5), iso(t0 + 15 * 60_000));
  db.prepare("UPDATE missions SET status = 'expired', final_usd = 43, ended_at = ? WHERE id = ?").run(iso(t0 + 15 * 60_000), m.id);
  const row = memory.recentApproach()!.perMission.find((x) => x.missionId === m.id)!;
  assert.equal(row.idleAtEndMinutes, 7);
  assert.equal(row.parkedAtEnd, false);
});

test("el mapa de lo explorado cuenta las operaciones por zona y marca las que nunca se han probado", async () => {
  const m = await createMission(50, 55, 15, undefined, { solana: 100 });
  db.prepare(
    `INSERT INTO positions (mission_id, venue, asset, symbol, opened_at, closed_at, status, qty_open, cost_open_usd, realized_cost_usd, realized_proceeds_usd, entry_features, research)
     VALUES (?, 'solana', 'Young1', 'YNG', ?, ?, 'closed', 0, 0, 10, 12, '{"ageMinutes":90,"liquidityUsd":30000}', '{}')`,
  ).run(m.id, new Date().toISOString(), new Date().toISOString());
  const map = memory.explorationMap();
  const row = map.spotByAgeAndLiquidity.find((r) => r.age === "1-3 h") as Record<string, string>;
  assert.match(row["15-50k"]!, /1G/);
  assert.equal(row[">1M"], "sin probar");
  assert.ok(map.byVenue.solana!.trades >= 1);
});
