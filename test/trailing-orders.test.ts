// Órdenes trailing: venden cuando el precio cae trail_pct % desde el máximo alcanzado. La toma de
// beneficio trailing no se arma hasta que sube activate_at_pct %. El máximo se guarda en la orden
// (columna trail_peak), así que sobrevive a reinicios del proceso.
import assert from "node:assert/strict";
import { test } from "node:test";
import { db } from "../src/db.js";
import { createMission } from "../src/sim/mission.js";
import { checkOrders, placeOrder } from "../src/sim/orders.js";
import { getHoldings, swap } from "../src/sim/portfolio.js";
import { installFakeMarket, MEME, setPrice } from "./fake-market.js";

installFakeMarket();

const bal = (missionId: number, asset: string) =>
  getHoldings(missionId).find((h) => h.venue === "solana" && h.asset === asset)?.amount ?? 0;

test("trailing stop: vende cuando cae trail_pct % desde el máximo alcanzado", async () => {
  setPrice(MEME, 0.01);
  const m = (await createMission(1000, 5000, 60, undefined, { solana: 100 })).id;
  await swap({ missionId: m, sessionId: null, chain: "solana", input: "USDC", output: MEME, amount: 10, slippageBps: 100, reasoning: "test" });

  const o = await placeOrder({
    missionId: m,
    sessionId: null,
    venue: "solana",
    triggerAsset: MEME,
    condition: "trailing_stop",
    action: { input: MEME, output: "USDC", amount: 0, sellAll: true, slippageBps: 300, trail: { pct: 5 } },
    reasoning: "trailing stop 5 %",
  });
  assert.match(o.summary, /trailing stop \(5 %\)/);

  // El máximo empieza en la referencia (precio de venta ~0,00997): sin caída, no vende.
  await checkOrders();
  assert.ok(bal(m, MEME) > 0, "sin caída no vende");

  // Sube a 0,02: el máximo se actualiza.
  setPrice(MEME, 0.02);
  await checkOrders();
  assert.ok(bal(m, MEME) > 0);

  // Cae a 0,018: el precio de venta (~0,01795) queda por debajo del máximo*0,95 (~0,01894) → vende.
  setPrice(MEME, 0.018);
  const log = await checkOrders();
  assert.match(log.join("\n"), /Orden trailing #\d+ disparada/);
  assert.equal(bal(m, MEME), 0);
  const row = db.prepare("SELECT status, trail_peak FROM orders WHERE id = ?").get(o.id) as { status: string; trail_peak: number };
  assert.equal(row.status, "filled");
  assert.ok(row.trail_peak > 0);
});

test("trailing stop con una caída menor que trail_pct no vende", async () => {
  setPrice(MEME, 0.01);
  const m = (await createMission(1000, 5000, 60, undefined, { solana: 100 })).id;
  await swap({ missionId: m, sessionId: null, chain: "solana", input: "USDC", output: MEME, amount: 10, slippageBps: 100, reasoning: "test" });
  await placeOrder({
    missionId: m,
    sessionId: null,
    venue: "solana",
    triggerAsset: MEME,
    condition: "trailing_stop",
    action: { input: MEME, output: "USDC", amount: 0, sellAll: true, slippageBps: 300, trail: { pct: 5 } },
    reasoning: "trailing 5 %",
  });
  setPrice(MEME, 0.02); // sube: máximo nuevo
  await checkOrders();
  setPrice(MEME, 0.0195); // baja ~2,5 %: por encima del -5 %
  await checkOrders();
  assert.ok(bal(m, MEME) > 0, "una caída menor que trail_pct no vende");
});

test("trailing_tp: no se arma hasta subir activate_at_pct % y luego sigue el máximo", async () => {
  setPrice(MEME, 0.01);
  const m = (await createMission(1000, 5000, 60, undefined, { solana: 100 })).id;
  await swap({ missionId: m, sessionId: null, chain: "solana", input: "USDC", output: MEME, amount: 10, slippageBps: 100, reasoning: "test" });

  await placeOrder({
    missionId: m,
    sessionId: null,
    venue: "solana",
    triggerAsset: MEME,
    condition: "trailing_tp",
    action: { input: MEME, output: "USDC", amount: 0, sellAll: true, slippageBps: 300, trail: { pct: 5, activateAtPct: 20 } },
    reasoning: "tp trailing",
  });

  // Sube solo un 10 %: no llega al +20 % para armarse → no vende.
  setPrice(MEME, 0.011);
  await checkOrders();
  assert.ok(bal(m, MEME) > 0, "sin armar no vende");

  // Sube a +30 % (0,013): se arma con el máximo ahí.
  setPrice(MEME, 0.013);
  await checkOrders();
  assert.ok(bal(m, MEME) > 0);

  // Cae a 0,012: precio de venta ~0,01196 por debajo del máximo*0,95 (~0,01231) → vende.
  setPrice(MEME, 0.012);
  const log = await checkOrders();
  assert.match(log.join("\n"), /Orden trailing #\d+ disparada/);
  assert.equal(bal(m, MEME), 0);
});

test("una orden trailing necesita trail_pct y, la tp, activate_at_pct", async () => {
  setPrice(MEME, 0.01);
  const m = (await createMission(1000, 5000, 60, undefined, { solana: 100 })).id;
  await swap({ missionId: m, sessionId: null, chain: "solana", input: "USDC", output: MEME, amount: 10, slippageBps: 100, reasoning: "test" });
  await assert.rejects(
    placeOrder({
      missionId: m,
      sessionId: null,
      venue: "solana",
      triggerAsset: MEME,
      condition: "trailing_stop",
      action: { input: MEME, output: "USDC", amount: 0, sellAll: true, slippageBps: 300 },
      reasoning: "x",
    }),
    /trail_pct/,
  );
  await assert.rejects(
    placeOrder({
      missionId: m,
      sessionId: null,
      venue: "solana",
      triggerAsset: MEME,
      condition: "trailing_tp",
      action: { input: MEME, output: "USDC", amount: 0, sellAll: true, slippageBps: 300, trail: { pct: 5 } },
      reasoning: "x",
    }),
    /activate_at_pct/,
  );
});
