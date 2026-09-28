// Datos de decisión en las posiciones: el agente puede aprender reglas de tamaño, reentrada y promediar
// igual que las de datos del token (creencias con condición y evidencia medida). Nada impuesto.
import assert from "node:assert/strict";
import { test } from "node:test";
import { db, now } from "../src/db.js";
import { USDC_MINT } from "../src/market/jupiter.js";
import * as memory from "../src/sim/memory.js";
import { createMission } from "../src/sim/mission.js";
import { decisionContext, listPositions } from "../src/sim/positions.js";
import { runTool } from "../src/tools/index.js";
import { installFakeMarket, setPrice, tokens } from "./fake-market.js";

installFakeMarket();

const mission = await createMission(100, 120, 60, undefined, { solana: 100 });
const ctx = { sessionId: 1, missionId: mission.id };
const mint = Object.keys(tokens).find((m) => tokens[m]!.symbol !== "USDC" && tokens[m]!.symbol !== "SOL")!;
const thesis = { why: "prueba", evidence: "prueba", sources: ["test"], exit_plan: "x", beliefs_applied: [], memory_note: "x", risks_checked: "revisé riskCheck y creencias negativas" };
const buy = (amount: number) => runTool("simulate_swap", { chain: "solana", input: "USDC", output: mint, amount, slippage_bps: 100, thesis }, ctx);

test("cada compra guarda qué parte del capital pone, si vuelve a un token ya operado y si promedia en pérdidas", async () => {
  setPrice(mint, 2);
  assert.ok(!(await buy(40)).isError);
  let p = listPositions(mission.id).find((x) => x.asset === mint)!;
  assert.ok(Number(p.research.portfolioPct) >= 39 && Number(p.research.portfolioPct) <= 42, String(p.research.portfolioPct));
  assert.equal(p.research.previousTradesInToken, 0);
  assert.equal(p.research.addedWhileDown, false);
  // Cae y compra más: queda anotado que promedió a la baja y la mayor parte del capital que llegó a tener.
  setPrice(mint, 1.5);
  assert.ok(!(await buy(30)).isError);
  p = listPositions(mission.id).find((x) => x.asset === mint)!;
  assert.equal(p.research.addedWhileDown, true);
  assert.equal(p.research.adds, 1);
  assert.ok(Number(p.research.portfolioPct) >= 70, String(p.research.portfolioPct));
  // Tras venderlo, volver a él cuenta como reentrada, con el resultado de la vez anterior.
  assert.ok(!(await runTool("simulate_swap", { chain: "solana", input: mint, output: "USDC", sell_all: true, slippage_bps: 100, thesis }, ctx)).isError);
  const again = decisionContext(mission.id, "solana", mint, 10, false);
  assert.equal(again.previousTradesInToken, 1);
  assert.ok((again.lastPnlInTokenPct ?? 0) < 0);
});

test("una creencia aprendida sobre el tamaño frena la compra grande y deja pasar la pequeña", async () => {
  // Evidencia: cinco posiciones pasadas con más del 60 % del capital que acabaron hundidas.
  for (let i = 0; i < 5; i++) {
    db.prepare(
      `INSERT INTO positions (mission_id, venue, asset, symbol, opened_at, closed_at, status, qty_open, cost_open_usd, realized_cost_usd, realized_proceeds_usd, entry_features, research)
       VALUES (?, 'solana', ?, 'OLD', ?, ?, 'closed', 0, 0, 50, 8, '{"venue":"solana"}', '{"portfolioPct":90}')`,
    ).run(mission.id, `Old${i}`, now(), now());
  }
  const b = memory.writeBelief({
    statement: "Meter la mayor parte del capital en un solo memecoin suele acabar hundido",
    appliesTo: "Solana",
    expectation: "negative",
    condition: { all: [{ f: "portfolioPct", op: ">=", v: 60 }] },
    missionId: null,
  });
  setPrice(mint, 2);
  const big = await buy(80);
  assert.equal(big.isError, true);
  assert.match(String(big.content), new RegExp(`#${b.id}`));
  assert.ok(!(await buy(15)).isError, "con poco capital no la cumple");
  void USDC_MINT;
});
