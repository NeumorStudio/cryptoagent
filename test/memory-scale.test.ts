// Memoria que aguanta cientos de misiones: evidencia fuera de muestra y reciente, howtos con tamaño máximo, misiones de
// control sin memoria y curva de aprendizaje.
import assert from "node:assert/strict";
import { test } from "node:test";
import { db } from "../src/db.js";
import * as memory from "../src/sim/memory.js";
import { createMission, getMission, isMemoryOff } from "../src/sim/mission.js";
import { installFakeMarket } from "./fake-market.js";

installFakeMarket();
const mission = await createMission(1000, 1200, 60, undefined, { solana: 100 }, { memory: "on" });
let n = 0;
const closedAt = (when: string, entry: Record<string, unknown>, pnl: number) =>
  db
    .prepare(
      `INSERT INTO positions (mission_id, venue, asset, symbol, opened_at, closed_at, status, qty_open, cost_open_usd, realized_cost_usd, realized_proceeds_usd, entry_features, research)
       VALUES (?, 'solana', ?, 'T', ?, ?, 'closed', 0, 0, 10, ?, ?, '{}')`,
    )
    .run(mission.id, `scl${++n}`, when, when, 10 * (1 + pnl / 100), JSON.stringify({ venue: "solana", ...entry }));

test("la etapa de una creencia se mide fuera de muestra, y si los datos nuevos la contradicen, deja de frenar", () => {
  const past = new Date(Date.now() - 3_600_000).toISOString();
  // Antes de escribirla: 10 casos a favor (pierden). Encaja con el pasado.
  for (let i = 0; i < 10; i++) closedAt(past, { liquidityUsd: 777 }, -40);
  const b = memory.writeBelief({ statement: "liquidez exacta de prueba pierde", appliesTo: "t", expectation: "negative", condition: { all: [{ f: "liquidityUsd", op: "=", v: 777 }] }, missionId: null }) as { id: number };
  const ev = () => (memory.beliefsFor("solana", { liquidityUsd: 777 }) as { cases: Record<number, { stage: string }>; block: number[] });
  assert.equal(ev().cases[b.id]!.stage, "hypothesis", "10 casos del pasado no bastan: hacen falta casos nuevos");
  assert.ok(ev().block.includes(b.id), "con el pasado, frena");
  // Después: 6 casos en contra (ganan). Los datos nuevos la contradicen.
  const later = new Date(Date.now() + 1000).toISOString();
  for (let i = 0; i < 6; i++) closedAt(later, { liquidityUsd: 777 }, 40);
  assert.ok(!ev().block.includes(b.id), "con los datos nuevos en contra, ya no frena");
  assert.equal(ev().cases[b.id]!.stage, "provisional");
  const cands = memory.retireCandidates().beliefs as Array<{ id: number; reason: string }>;
  assert.match(cands.find((c) => c.id === b.id)!.reason, /datos nuevos la contradicen/);
});

test("un howto no puede pasar del tamaño máximo: hay que resumirlo", () => {
  assert.throws(
    () => memory.writeHowto({ scope: "s", topic: "t", title: "Muy largo", steps: "x".repeat(memory.HOWTO_MAX_CHARS + 1), missionId: null }),
    /reescríbelo resumido/,
  );
});

test("misiones de control: una de cada 10 se juega sin memoria, y la curva compara con y sin memoria", async () => {
  const off = await createMission(1000, null, 30, undefined, { solana: 100 }, { memory: "off" });
  assert.equal(isMemoryOff(off.id), true);
  assert.equal(isMemoryOff(mission.id), false);
  // Terminar unas cuantas para la curva.
  const finish = (id: number, final: number) => db.prepare("UPDATE missions SET status = 'expired', final_usd = ? WHERE id = ?").run(final, id);
  finish(off.id, 950);
  const off2 = await createMission(1000, null, 30, undefined, { solana: 100 }, { memory: "off" });
  finish(off2.id, 970);
  for (let i = 0; i < 5; i++) {
    const m = await createMission(1000, null, 30, undefined, { solana: 100 }, { memory: "on" });
    finish(m.id, 1050);
  }
  const lc = memory.learningCurve() as { control: { missions: number; avgResultPct: number }; verdict: string; blocks: unknown[] };
  assert.equal(lc.control.missions, 2);
  assert.equal(lc.control.avgResultPct, -4);
  assert.ok(lc.blocks.length >= 1);
  assert.match(lc.verdict, /la memoria le ayuda/);
  assert.equal(getMission(off.id)!.memory_off, 1);
});

test("lo que vio y no compró: se guarda al escanear, se mide al acabar y el revisor lo ve (sin lo que sí compró)", async () => {
  const { recordSeen, measureSkipped, skippedCandidates } = await import("../src/sim/skipped.js");
  const { USDC_MINT, SOL_MINT } = await import("../src/market/jupiter.js");
  const m = await createMission(100, null, 15, undefined, { solana: 100 }, { memory: "on" });
  await recordSeen(m.id, "solana", [
    { mint: SOL_MINT, symbol: "SOL", liquidityUsd: 1_000_000 },
    { mint: USDC_MINT, symbol: "USDC", liquidityUsd: 5_000_000 },
  ]);
  // Compró USDC (por ejemplo): ese no cuenta como descartado.
  db.prepare("INSERT INTO positions (mission_id, venue, asset, symbol, opened_at, status, qty_open, cost_open_usd, realized_cost_usd, realized_proceeds_usd) VALUES (?, 'solana', ?, 'USDC', ?, 'open', 1, 1, 0, 0)").run(m.id, USDC_MINT, new Date().toISOString());
  db.prepare("UPDATE scan_seen SET price_usd = price_usd / 2 WHERE mission_id = ? AND asset = ?").run(m.id, SOL_MINT); // al verlo valía la mitad
  await measureSkipped(m.id);
  const s = skippedCandidates(m.id)!;
  assert.equal(s.seenNotBought, 1);
  assert.equal(s.biggestMoves[0]!.symbol, "SOL");
  assert.equal(s.biggestMoves[0]!.changeUntilEndPct, 100);
  assert.equal(s.upMoreThan20Pct, 1);
});
