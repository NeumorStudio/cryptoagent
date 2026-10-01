// Saltarse una creencia negativa fuerte sigue siendo posible, pero ya no a ciegas: la posición guarda qué
// creencias se saltó y el freno enseña cómo le fue las veces anteriores que la ignoró.
import assert from "node:assert/strict";
import { test } from "node:test";
import { db, now } from "../src/db.js";
import * as memory from "../src/sim/memory.js";
import { createMission } from "../src/sim/mission.js";
import { listPositions } from "../src/sim/positions.js";
import { runTool } from "../src/tools/index.js";
import { installFakeMarket, MEME, MEME_DEV } from "./fake-market.js";

installFakeMarket();

const mission = await createMission(1000, 1200, 60, undefined, { solana: 100 });
const ctx = { sessionId: 1, missionId: mission.id };
const thesis = { why: "prueba", evidence: "prueba", sources: ["test"], exit_plan: "x", beliefs_applied: [], memory_note: "x", risks_checked: "revisé riskCheck y creencias negativas" };
const buy = { chain: "solana", input: "USDC", output: MEME, amount: 10, slippage_bps: 100 };

test("el freno enseña cómo le fue al agente cuando se saltó esa creencia", async () => {
  // Cinco tokens del mismo creador perdieron casi todo: una creencia sobre él tiene evidencia fuerte y frena.
  for (let i = 0; i < 5; i++) {
    db.prepare(
      `INSERT INTO positions (mission_id, venue, asset, symbol, opened_at, closed_at, status, qty_open, cost_open_usd, realized_cost_usd, realized_proceeds_usd, entry_features, research)
       VALUES (?, 'solana', ?, 'OLD', ?, ?, 'closed', 0, 0, 10, 2, ?, '{}')`,
    ).run(mission.id, `Old${i}`, now(), now(), JSON.stringify({ venue: "solana", creator: MEME_DEV }));
  }
  const b = memory.writeBelief({
    statement: "Los tokens de este creador acaban en pérdidas",
    appliesTo: "Solana",
    expectation: "negative",
    condition: { all: [{ f: "creator", op: "=", v: MEME_DEV }] },
    missionId: null,
  } as unknown as Parameters<typeof memory.writeBelief>[0]);

  const blocked = await runTool("simulate_swap", { ...buy, thesis }, ctx);
  assert.equal(blocked.isError, true);
  assert.doesNotMatch(String(blocked.content), /Cuando la ignoraste/, "nunca se la ha saltado");

  // Se la salta a sabiendas: la posición lo guarda.
  const overrides = [{ id: b.id, reason: "quiero comprobar si esta vez es distinto" }];
  const ok = await runTool("simulate_swap", { ...buy, thesis: { ...thesis, overrides } }, ctx);
  assert.ok(!ok.isError, String(ok.content));
  const p = listPositions(mission.id).find((x) => x.asset === MEME && x.status === "open")!;
  assert.deepEqual([p.research.beliefsOverridden, p.research.overriddenBeliefIds], [1, [b.id]]);

  // Sale con pérdida: la próxima vez, el freno lo dice.
  db.prepare("UPDATE positions SET status = 'closed', closed_at = ?, qty_open = 0, realized_cost_usd = 10, realized_proceeds_usd = 6 WHERE id = ?").run(now(), p.id);
  db.prepare("DELETE FROM holdings WHERE mission_id = ? AND asset = ?").run(mission.id, MEME);
  const again = await runTool("simulate_swap", { ...buy, thesis }, ctx);
  assert.equal(again.isError, true);
  assert.match(String(again.content), /Cuando la ignoraste: te la has saltado 1 vez: 0 ganadas, media -40\.0 %/);
  assert.deepEqual(memory.overrideRecord(b.id), { times: 1, won: 0, avgPnlPct: -40, text: "te la has saltado 1 vez: 0 ganadas, media -40.0 %" });

  // Y una creencia puede medir cualquier entrada hecha saltándose la memoria.
  assert.ok(memory.matches({ all: [{ f: "beliefsOverridden", op: ">=", v: 1 }] }, { ...p, research: { ...p.research } } as never));
});

test("cada entrada guarda cómo iba la misión: n.º de entrada, pérdidas previas, resultado acumulado y minutos desde la última pérdida", async () => {
  const { missionPathAtEntry } = await import("../src/sim/positions.js");
  const m = await createMission(100, 110, 60, undefined, { solana: 100 });
  const t = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const insert = db.prepare(
    `INSERT INTO positions (mission_id, venue, asset, symbol, opened_at, closed_at, status, qty_open, cost_open_usd, realized_cost_usd, realized_proceeds_usd, entry_features, research)
     VALUES (?, 'solana', ?, 'X', ?, ?, 'closed', 0, 0, ?, ?, '{}', '{}')`,
  );
  insert.run(m.id, "A", t(10), t(8), 40, 30); // -10 $
  insert.run(m.id, "B", t(7), t(3), 30, 33); // +3 $
  assert.deepEqual(missionPathAtEntry(m.id, new Date().toISOString()), {
    entryNumberInMission: 3,
    lossesBeforeInMission: 1,
    winsBeforeInMission: 1,
    // La última cerrada fue ganadora: racha de +1.
    streakAtEntry: 1,
    missionPnlPctAtEntry: -7,
    minutesSinceLastLoss: 8,
    missionPeakPnlPctAtEntry: 0,
  });
  // Y va en los datos de decisión de cada compra.
  const mm = await createMission(1000, 1200, 60, undefined, { solana: 100 });
  const r = await runTool("simulate_swap", { ...buy, output: "SOL", thesis }, { sessionId: 1, missionId: mm.id });
  assert.ok(!r.isError, String(r.content));
  const p = listPositions(mm.id).find((x) => x.status === "open")!;
  assert.equal(p.research.entryNumberInMission, 1);
  assert.equal(p.research.lossesBeforeInMission, 0);
});

test("el revisor ve el coste medido de entrar y salir en las misiones recientes", async () => {
  const m = await createMission(100, 110, 60, undefined, { solana: 100 });
  const insert = db.prepare(
    `INSERT INTO positions (mission_id, venue, asset, symbol, opened_at, closed_at, status, qty_open, cost_open_usd, realized_cost_usd, realized_proceeds_usd, entry_features, research)
     VALUES (?, 'solana', ?, 'X', ?, ?, 'closed', 0, 0, 10, 10, '{}', ?)`,
  );
  for (const [i, rt] of [1, 2, 3, 4].entries()) insert.run(m.id, `RT${i}`, now(), now(), JSON.stringify({ roundTripAtEntryPct: rt }));
  // Las demás misiones de este archivo quedan activas: solo cuenta esta, ya terminada.
  db.prepare("UPDATE missions SET status = 'expired', final_usd = 100, ended_at = ? WHERE id = ?").run(now(), m.id);
  assert.equal((memory.recentApproach() as { summary: { roundTripAtEntry: string } }).summary.roundTripAtEntry, "mediana 3 %, p75 4 % (4 compras)");
});
