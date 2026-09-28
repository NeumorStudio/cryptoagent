// Bloque C: el revisor a mitad de misión recibe todo en una respuesta (checkpoint) y las esperas no
// pasan de 4,5 minutos (la caché de prompts de los subagentes dura 5).
import assert from "node:assert/strict";
import { test } from "node:test";
import { db, now } from "../src/db.js";
import * as memory from "../src/sim/memory.js";
import { createMission } from "../src/sim/mission.js";
import { runTool } from "../src/tools/index.js";
import { installFakeMarket } from "./fake-market.js";

installFakeMarket();

const mission = await createMission(1000, 1200, 60, undefined, { solana: 100 });
const ctx = { sessionId: 1, missionId: mission.id };

test("checkpoint: lo nuevo, las creencias que tocan las posiciones nuevas y los howtos por título", () => {
  const applied = memory.writeBelief({ statement: "Los pools muy jóvenes con compradores netos suben en los primeros minutos", appliesTo: "Solana", missionId: null });
  const matching = memory.writeBelief({
    statement: "Liquidez por debajo de 20k suele acabar en rug de liquidez",
    appliesTo: "Solana",
    expectation: "negative",
    condition: { all: [{ f: "liquidityUsd", op: "<", v: 20000 }] },
    missionId: null,
  });
  const unrelated = memory.writeBelief({
    statement: "Los tokens con mcap por encima de mil millones apenas se mueven en una hora",
    appliesTo: "Solana",
    expectation: "negative",
    condition: { all: [{ f: "mcapUsd", op: ">", v: 1e9 }] },
    missionId: null,
  });
  db.prepare(
    `INSERT INTO positions (mission_id, venue, asset, symbol, opened_at, status, qty_open, cost_open_usd, realized_cost_usd, realized_proceeds_usd, entry_features, research, beliefs_applied)
     VALUES (?, 'solana', 'NEWPOS', 'NEW', ?, 'open', 10, 10, 0, 0, ?, '{}', ?)`,
  ).run(mission.id, now(), JSON.stringify({ venue: "solana", liquidityUsd: 15000, mcapUsd: 90000 }), JSON.stringify([applied.id]));

  const cp = memory.checkpointData(mission.id);
  const ids = cp.memory.beliefsTouched.map((b) => b.id).sort();
  assert.deepEqual(ids, [applied.id, matching.id].sort());
  assert.ok(!ids.includes(unrelated.id));
  assert.match(cp.memory.otherBeliefs, /creencias más/);
  assert.ok(Array.isArray(cp.memory.howtos));
  assert.ok(cp.positions.some((p) => p.symbol === "NEW"));
  assert.equal(cp.since, mission.created_at);

  // Tras review_checkpoint, la siguiente revisión parte de ahí.
  memory.reviewCheckpoint(mission.id, "revisado");
  assert.ok(memory.checkpointData(mission.id).since > mission.created_at);
});

test("las esperas no pasan de 4,5 minutos", async () => {
  assert.equal((await runTool("wait", { minutes: 10 }, ctx)).isError, true);
  assert.equal((await runTool("wait_for_activity", { max_minutes: 5 }, ctx)).isError, true);
});
