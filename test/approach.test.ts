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
