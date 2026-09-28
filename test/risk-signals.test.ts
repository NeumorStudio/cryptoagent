// Bloque A: señales de riesgo del creador y del token, lista negra de creadores, segunda lectura en
// token_report y launchpad de BNB Chain deducido de la dirección.
import assert from "node:assert/strict";
import { test } from "node:test";
import { db, now } from "../src/db.js";
import { bscLaunchpad } from "../src/sim/launchpads.js";
import * as memory from "../src/sim/memory.js";
import { createMission } from "../src/sim/mission.js";
import { runTool } from "../src/tools/index.js";
import { installFakeMarket, MEME, MEME_DEV } from "./fake-market.js";

installFakeMarket();

const mission = await createMission(1000, 1200, 60, undefined, { solana: 100 });
const ctx = { sessionId: 1, missionId: mission.id };
const thesis = { why: "prueba", evidence: "prueba", sources: ["test"], exit_plan: "x", beliefs_applied: [], memory_note: "x" };

test("launchpad de BNB Chain por la dirección", () => {
  assert.equal(bscLaunchpad("0xb1cee4255275ea7954647f8acda8a399da377777"), "flap.sh");
  assert.equal(bscLaunchpad("0x1234567890123456789012345678901234564444"), "four.meme");
  assert.equal(bscLaunchpad("0x55d398326f99059ff775485246999027b3197955"), undefined);
});

test("una creencia sobre flap.sh tiene evidencia con las operaciones antiguas (que guardaban el DEX)", () => {
  for (const [addr, pnl] of [["0xaaaa000000000000000000000000000000007777", -100], ["0xbbbb000000000000000000000000000000007777", -95]] as const) {
    db.prepare(
      `INSERT INTO positions (mission_id, venue, asset, symbol, opened_at, closed_at, status, qty_open, cost_open_usd, realized_cost_usd, realized_proceeds_usd, entry_features, research)
       VALUES (?, 'bsc', ?, 'FLAP', ?, ?, 'closed', 0, 0, 10, ?, ?, '{}')`,
    ).run(mission.id, addr, now(), now(), 10 * (1 + pnl / 100), JSON.stringify({ venue: "bsc", launchpad: "pancakeswap" }));
  }
  const b = memory.writeBelief({
    statement: "Los tokens de Flap.sh acaban en -100 %",
    appliesTo: "BNB Chain",
    expectation: "negative",
    condition: { all: [{ f: "launchpad", op: "=", v: "flap.sh" }] },
    missionId: null,
  });
  assert.equal(b.evidence.matchingTrades?.trades, 2);
});

test("token_report avisa del creador en serie y, en la segunda lectura, dice qué ha cambiado", async () => {
  const first = String((await runTool("token_report", { chain: "solana", token: MEME }, ctx)).content);
  assert.match(first, /creador en serie: 40 tokens lanzados, 0 graduados/);
  assert.match(first, /primera lectura/);
  const second = String((await runTool("token_report", { chain: "solana", token: MEME }, ctx)).content);
  assert.match(second, /minutesAgo/);
});

test("lista negra: si un token del mismo creador ya costó un 80 % o más, se frena la compra (se puede saltar con id 0)", async () => {
  db.prepare(
    `INSERT INTO positions (mission_id, venue, asset, symbol, opened_at, closed_at, status, qty_open, cost_open_usd, realized_cost_usd, realized_proceeds_usd, entry_features, research)
     VALUES (?, 'solana', 'OldRug', 'OLDRUG', ?, ?, 'closed', 0, 0, 20, 0.5, ?, '{}')`,
  ).run(mission.id, now(), now(), JSON.stringify({ venue: "solana", creator: MEME_DEV }));
  const buy = { chain: "solana", input: "USDC", output: MEME, amount: 10, slippage_bps: 100 };
  const blocked = await runTool("simulate_swap", { ...buy, thesis }, ctx);
  assert.equal(blocked.isError, true);
  assert.match(String(blocked.content), /Lista negra.*OLDRUG.*id: 0/s);
  const ok = await runTool("simulate_swap", { ...buy, thesis: { ...thesis, overrides: [{ id: 0, reason: "quiero ver si este creador ha cambiado" }] } }, ctx);
  assert.ok(!ok.isError, String(ok.content));
  // La posición guarda el creador y su historial.
  const p = db.prepare("SELECT entry_features FROM positions WHERE mission_id = ? AND asset = ? ORDER BY id DESC LIMIT 1").get(mission.id, MEME) as { entry_features: string };
  const f = JSON.parse(p.entry_features);
  assert.deepEqual([f.creator, f.creatorTokens, f.creatorGraduated, f.creatorGraduationPct], [MEME_DEV, 40, 0, 0]);
});
