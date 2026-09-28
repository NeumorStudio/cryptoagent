// Bloque B: menos turnos. Fichas breves de varios tokens en una llamada, chequeo de riesgo y memoria de
// los primeros candidatos del escaneo, y la espera que resume lo que ha cambiado.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as memory from "../src/sim/memory.js";
import { createMission } from "../src/sim/mission.js";
import { movesSince, runTool, screenCandidates } from "../src/tools/index.js";
import { installFakeMarket, MEME } from "./fake-market.js";

installFakeMarket();

const mission = await createMission(1000, 1200, 60, undefined, { solana: 100 });
const ctx = { sessionId: 1, missionId: mission.id };

test("token_report con tokens: fichas breves, con alarmas y la segunda lectura", async () => {
  const first = await runTool("token_report", { chain: "solana", tokens: [MEME, "SOL"] }, ctx);
  assert.ok(!first.isError, String(first.content));
  const text = String(first.content);
  assert.match(text, /\[2\] token\|symbol/);
  assert.match(text, /creador en serie: 40 tokens lanzados/);
  assert.match(text, /primera lectura/);
  const second = String((await runTool("token_report", { chain: "solana", tokens: [MEME] }, ctx)).content);
  assert.match(second, /hace \d/);
  assert.equal((await runTool("token_report", { chain: "solana" }, ctx)).isError, true);
});

test("el escaneo marca en los primeros candidatos las alarmas y lo que dice la memoria", async () => {
  const b = memory.writeBelief({
    statement: "Los tokens de creadores con muchos lanzamientos suelen acabar mal",
    appliesTo: "Solana",
    expectation: "negative",
    condition: { all: [{ f: "creatorTokens", op: ">=", v: 30 }] },
    missionId: null,
  });
  const rows = await screenCandidates("solana", [{ mint: MEME, symbol: "MEME", warning: "creador en serie" }, { mint: "otro", symbol: "X" }], 1);
  assert.match(String(rows[0]!.alarms), /creador en serie/);
  assert.equal(rows[0]!.warning, undefined);
  assert.match(String(rows[0]!.memory), new RegExp(`avisa #${b.id}\\b`));
  assert.equal(rows[1]!.alarms, undefined, "solo los N primeros");
});

test("la espera resume cómo se han movido las posiciones, también las nuevas y las cerradas", () => {
  const base = new Map([["solana:A", { position: "A (solana)", usd: 10 }], ["solana:B", { position: "B (solana)", usd: 5 }]]);
  const now = new Map([["solana:A", { position: "A (solana)", usd: 12 }], ["perp:1", { position: "SOL-PERP largo 5x", usd: 20 }]]);
  assert.deepEqual(movesSince(base, now), [
    { position: "A (solana)", startUsd: 10, nowUsd: 12, changePct: 20 },
    { position: "B (solana)", startUsd: 5, nowUsd: 0, changePct: -100, note: "cerrada o sin valor" },
    { position: "SOL-PERP largo 5x", startUsd: 0, nowUsd: 20, changePct: 0, note: "nueva" },
  ]);
});
