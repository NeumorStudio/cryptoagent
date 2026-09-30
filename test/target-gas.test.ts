// Al tocar el objetivo en valoración se vende todo, pero el nativo (gas) solo si la misión se cierra de verdad:
// si lo realizado se queda corto y la misión sigue, tiene que quedar gas para volver a operar.
// Y si al vender el precio ya se ha ido, no se vende nada.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SOL_MINT } from "../src/market/jupiter.js";
import { db } from "../src/db.js";
import { setFetchImpl } from "../src/market/http.js";
import { checkMission, createMission, getMission } from "../src/sim/mission.js";
import { balance, liquidateAll } from "../src/sim/portfolio.js";
import { runTool } from "../src/tools/index.js";
import { handle, installFakeMarket, MEME, setPrice, tokens } from "./fake-market.js";

installFakeMarket();

test("el cierre por objetivo vende primero todo menos el gas, y el gas solo cuando la misión se cierra", async () => {
  setPrice(MEME, 1);
  const m = await createMission(100, 110, 60, undefined, { solana: 100 });
  const thesis = { why: "x", evidence: "x", sources: ["t"], exit_plan: "x", beliefs_applied: [], memory_note: "x", risks_checked: "revisé riskCheck" };
  const r = await runTool("simulate_swap", { chain: "solana", input: "USDC", output: MEME, amount: 90, slippage_bps: 300, thesis }, { sessionId: 1, missionId: m.id });
  assert.ok(!r.isError, String(r.content));
  const sol = balance(m.id, "solana", SOL_MINT);
  assert.ok(sol > 0.001);
  assert.deepEqual(await liquidateAll(m.id, null, "prueba", { keepNative: true }), []);
  assert.equal(balance(m.id, "solana", MEME), 0);
  assert.ok(balance(m.id, "solana", SOL_MINT) > sol * 0.5, "si la misión sigue, conserva el SOL del gas (menos la red de la venta)");
  await liquidateAll(m.id, null, "prueba", { nativeOnly: true });
  assert.ok(balance(m.id, "solana", SOL_MINT) < sol / 10, "al cerrarse, el SOL sí se vende");
});

test("si al vender el precio ya no da lo que confirmó el objetivo, no se cierra y la posición y sus órdenes siguen", async () => {
  setPrice(MEME, 1);
  const m = await createMission(100, 110, 60, undefined, { solana: 100 });
  const thesis = { why: "x", evidence: "x", sources: ["t"], exit_plan: "x", beliefs_applied: [], memory_note: "x", risks_checked: "revisé riskCheck" };
  const r = await runTool("simulate_swap", { chain: "solana", input: "USDC", output: MEME, amount: 90, slippage_bps: 300, thesis }, { sessionId: 1, missionId: m.id });
  assert.ok(!r.isError, String(r.content));
  const tp = await runTool("place_swap_trigger_order", { chain: "solana", trigger_asset: MEME, condition: "above", trigger_price: 2, input: MEME, output: "USDC", sell_all: true, slippage_bps: 300, thesis }, { sessionId: 1, missionId: m.id });
  assert.ok(!tp.isError, String(tp.content));
  const meme = balance(m.id, "solana", MEME);

  // El precio toca el objetivo en la valoración y se desploma justo antes de la venta (la cotización con el
  // slippage del cierre).
  setPrice(MEME, 1.3);
  let dropped = false;
  setFetchImpl((async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (!dropped && url.pathname === "/swap/v1/quote" && url.searchParams.get("inputMint") === MEME && url.searchParams.get("slippageBps") === "300") {
      dropped = true;
      tokens[MEME]!.price = 1.1;
    }
    return handle(url, init?.body);
  }) as typeof fetch);

  const log = await checkMission(m.id);
  assert.match(log.join("\n"), /no se cierra/);
  assert.ok(dropped, "la venta se intentó");
  assert.equal(getMission(m.id)!.status, "active");
  assert.equal(balance(m.id, "solana", MEME), meme, "no se ha vendido nada");
  assert.equal((db.prepare("SELECT COUNT(*) n FROM orders WHERE mission_id = ? AND status = 'open'").get(m.id) as { n: number }).n, 1, "la toma de beneficio sigue");
  installFakeMarket();
});
