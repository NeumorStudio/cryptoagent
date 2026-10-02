// Datos de riesgo del creador y del token (sin veredictos ni frenos fijos), historial con el creador,
// segunda lectura en token_report y launchpad de BNB Chain deducido de la dirección.
import assert from "node:assert/strict";
import { test } from "node:test";
import { db, now } from "../src/db.js";
import { bscLaunchpad } from "../src/sim/launchpads.js";
import * as memory from "../src/sim/memory.js";
import { createMission } from "../src/sim/mission.js";
import { runTool } from "../src/tools/index.js";
import { installFakeMarket, MEME, MEME_DEV, STONK, STONK_DEV } from "./fake-market.js";

installFakeMarket();

const mission = await createMission(1000, 1200, 60, undefined, { solana: 100 });
const ctx = { sessionId: 1, missionId: mission.id };
const thesis = { why: "prueba", evidence: "prueba", sources: ["test"], exit_plan: "x", beliefs_applied: [], memory_note: "x", risks_checked: "revisé riskCheck y creencias negativas" };

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

test("token_report da los datos del creador sin veredicto y, en la segunda lectura, dice qué ha cambiado", async () => {
  const first = String((await runTool("token_report", { chain: "solana", token: MEME }, ctx)).content);
  const rc = JSON.parse(first).riskCheck;
  assert.equal(rc.creatorTokens, 40);
  assert.equal(rc.creatorGraduated, 0);
  assert.equal(rc.flags, undefined);
  assert.doesNotMatch(first, /creador en serie|warning/);
  assert.match(first, /primera lectura/);
  const second = String((await runTool("token_report", { chain: "solana", token: MEME }, ctx)).content);
  assert.match(second, /minutesAgo/);
});

test("un creador que ya costó mucho no frena la compra: queda como dato, y una creencia aprendida sobre él sí frena", async () => {
  db.prepare(
    `INSERT INTO positions (mission_id, venue, asset, symbol, opened_at, closed_at, status, qty_open, cost_open_usd, realized_cost_usd, realized_proceeds_usd, entry_features, research)
     VALUES (?, 'solana', 'OldRug', 'OLDRUG', ?, ?, 'closed', 0, 0, 20, 0.5, ?, '{}')`,
  ).run(mission.id, now(), now(), JSON.stringify({ venue: "solana", creator: MEME_DEV }));
  const buy = { chain: "solana", input: "USDC", output: MEME, amount: 10, slippage_bps: 100 };
  const report = JSON.parse(String((await runTool("token_report", { chain: "solana", token: MEME }, ctx)).content));
  assert.equal(report.riskCheck.creatorTradesWithYou, 1);
  assert.ok(report.riskCheck.creatorWorstPnlWithYouPct <= -90);
  const ok = await runTool("simulate_swap", { ...buy, thesis }, ctx);
  assert.ok(!ok.isError, String(ok.content));
  // La posición guarda el creador y su historial, para que una creencia pueda aprenderlo.
  const p = db.prepare("SELECT entry_features FROM positions WHERE mission_id = ? AND asset = ? ORDER BY id DESC LIMIT 1").get(mission.id, MEME) as { entry_features: string };
  const f = JSON.parse(p.entry_features);
  assert.deepEqual([f.creator, f.creatorTokens, f.creatorGraduated, f.creatorGraduationPct, f.creatorTradesWithYou], [MEME_DEV, 40, 0, 0, 1]);
  assert.ok(f.creatorWorstPnlWithYouPct <= -90);
});

test("token_report compara el volumen de 1 h de Jupiter con el de todos los pares de DexScreener, sin veredicto", async () => {
  const { volumeJupiterVsDex } = await import("../src/market/research.js");
  assert.deepEqual(volumeJupiterVsDex({ stats1h: { buyVolumeUsd: 100_000, sellVolumeUsd: 62_000 } }, { volume1hAllPairsUsd: 10_000 }), {
    jupiter1hUsd: 162_000,
    dexscreener1hUsd: 10_000,
    volume1hJupiterVsDexRatio: 16.2,
  });
  assert.equal(volumeJupiterVsDex({ stats1h: { buyVolumeUsd: 5 } }, { volume1hAllPairsUsd: 0 }), undefined, "sin volumen en una fuente no hay cociente");
});

test("un creador con miles de lanzamientos se marca como probable plataforma, pero sus datos se dan igual", async () => {
  const rc = JSON.parse(String((await runTool("token_report", { chain: "solana", token: STONK }, ctx)).content)).riskCheck;
  assert.equal(rc.creatorIsLaunchpadDeployer, true);
  assert.equal(rc.creator, STONK_DEV);
  assert.equal(rc.creatorTokens, 6612);
  assert.equal(rc.creatorGraduated, 127);
  // Una creencia sobre creadores en masa también lo ve (antes se quedaba sin datos por encima de 5.000).
  const pos = { venue: "solana", asset: STONK, entry: { creatorTokens: 6612, creatorGraduationPct: 1.9 }, research: {} } as unknown as Parameters<typeof memory.matches>[1];
  assert.ok(memory.matches({ all: [{ f: "creatorTokens", op: ">=", v: 500 }, { f: "creatorGraduationPct", op: "<", v: 5 }] }, pos));
});

test("token_report trae los valores que usa la memoria, con el cociente de compras/ventas por volumen y por número", async () => {
  const r = JSON.parse(String((await runTool("token_report", { chain: "solana", token: STONK }, ctx)).content));
  assert.equal(r.memoryData.buySellRatio5m, 1.15);
  assert.equal(r.memoryData.buySellCountRatio5m, 1.35);
  assert.equal(r.memoryData.netBuyers5m, 200);
  assert.match(r.memoryData.note, /por volumen.*por número/);
  const pos = { venue: "solana", asset: STONK, entry: { buySellRatio5m: 1.15, buySellCountRatio5m: 1.35 }, research: {} } as unknown as Parameters<typeof memory.matches>[1];
  assert.ok(!memory.matches({ all: [{ f: "buySellRatio5m", op: ">=", v: 1.3 }] }, pos));
  assert.ok(memory.matches({ all: [{ f: "buySellCountRatio5m", op: ">=", v: 1.3 }] }, pos));
});

test("al comprar, dice qué creencias citadas no cumple el token, y no cuentan como aplicadas", async () => {
  const b = memory.writeBelief({
    statement: "En Solana, con las compras claramente por encima de las ventas por volumen, el arranque sigue",
    appliesTo: "Solana",
    expectation: "positive",
    condition: { all: [{ f: "venue", op: "=", v: "solana" }, { f: "buySellRatio5m", op: ">=", v: 1.3 }] },
    missionId: null,
  });
  const r = await runTool("simulate_swap", { chain: "solana", input: "USDC", output: STONK, amount: 10, slippage_bps: 300, thesis: { ...thesis, beliefs_applied: [b.id] } }, ctx);
  assert.ok(!r.isError, String(r.content));
  const out = JSON.parse(String(r.content));
  assert.deepEqual(out.citedBeliefsNotMet, [`Citas #${b.id}, pero este token no la cumple: buySellRatio5m 1.15 (pide >= 1.3)`]);
  const p = db.prepare("SELECT id, research FROM positions WHERE mission_id = ? AND asset = ? AND status = 'open'").get(mission.id, STONK) as { id: number; research: string };
  assert.deepEqual(JSON.parse(p.research).citedBeliefsNotMet, [b.id]);
  // Cerrada, no cuenta como una vez que la aplicó: solo como citada sin cumplirla.
  db.prepare("UPDATE positions SET status = 'closed', closed_at = ?, qty_open = 0, realized_cost_usd = 10, realized_proceeds_usd = 7 WHERE id = ?").run(now(), p.id);
  const view = (memory.recall() as unknown as { beliefs: Array<{ id: number; evidence: { appliedIn: Record<string, number> } }> }).beliefs.find((x) => x.id === b.id)!;
  assert.deepEqual(view.evidence.appliedIn, { trades: 0, citedWithoutMeetingIt: 1 });
});

test("al comprar, avisa de las creencias de 'tiende a perder' que cumple la entrada, con el dato que la activa", async () => {
  const b = memory.writeBelief({
    statement: "En Solana, comprar con las compras por encima de las ventas tiende a perder",
    appliesTo: "Solana",
    expectation: "negative",
    condition: { all: [{ f: "venue", op: "=", v: "solana" }, { f: "buySellRatio5m", op: ">=", v: 1 }] },
    missionId: null,
  });
  await runTool("token_report", { chain: "solana", token: STONK }, ctx);
  const r = await runTool("simulate_swap", { chain: "solana", input: "USDC", output: STONK, amount: 10, slippage_bps: 300, thesis }, ctx);
  assert.ok(!r.isError, String(r.content));
  const out = JSON.parse(String(r.content));
  assert.ok(out.negativeBeliefsAtEntry.some((w: string) => w.startsWith(`Al comprar, la entrada cumple #${b.id}`) && w.includes("buySellRatio5m = 1.15")));
  db.prepare("UPDATE beliefs SET status = 'retired' WHERE id = ?").run(b.id);
});

test("la ficha da la tendencia que usan las creencias (desde la primera lectura) y avisa si las lecturas van muy juntas", async () => {
  const m2 = await createMission(1000, 1200, 60, undefined, { solana: 100 });
  const c2 = { sessionId: 1, missionId: m2.id };
  const first = JSON.parse(String((await runTool("token_report", { chain: "solana", token: STONK }, c2)).content));
  assert.equal(first.riskCheck.trendForBeliefs, undefined);
  const second = JSON.parse(String((await runTool("token_report", { chain: "solana", token: STONK }, c2)).content));
  assert.equal(second.riskCheck.trendForBeliefs.readsBeforeBuy, 2);
  assert.match(second.riskCheck.trendForBeliefs.note, /muy juntas/);
});
