// Carril rápido del monitor (Fase 2): checkHotOrders mira solo las órdenes trailing y las dispara; el chequeo
// normal con skipTrailing las deja en paz para que no se coticen dos veces.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createMission } from "../src/sim/mission.js";
import { checkHotOrders, checkOrders, placeOrder } from "../src/sim/orders.js";
import { getHoldings, swap } from "../src/sim/portfolio.js";
import { installFakeMarket, MEME, setPrice } from "./fake-market.js";

installFakeMarket();

const bal = (missionId: number, asset: string) =>
  getHoldings(missionId).find((h) => h.venue === "solana" && h.asset === asset)?.amount ?? 0;

const buyAndTrail = async (pct: number) => {
  setPrice(MEME, 0.01);
  const m = (await createMission(1000, 5000, 60, undefined, { solana: 100 })).id;
  await swap({ missionId: m, sessionId: null, chain: "solana", input: "USDC", output: MEME, amount: 10, slippageBps: 100, reasoning: "test" });
  await placeOrder({
    missionId: m,
    sessionId: null,
    venue: "solana",
    triggerAsset: MEME,
    condition: "trailing_stop",
    action: { input: MEME, output: "USDC", amount: 0, sellAll: true, slippageBps: 300, trail: { pct } },
    reasoning: "trailing",
  });
  return m;
};

test("checkHotOrders dispara una trailing cuando cae desde el máximo", async () => {
  const m = await buyAndTrail(5);
  setPrice(MEME, 0.02); // sube: máximo nuevo
  assert.deepEqual(await checkHotOrders(), [], "sin caída no dispara");
  assert.ok(bal(m, MEME) > 0);

  setPrice(MEME, 0.018); // cae más del 5 % desde el máximo
  const log = await checkHotOrders();
  assert.match(log.join("\n"), /Orden trailing #\d+ disparada/);
  assert.equal(bal(m, MEME), 0);
});

test("checkOrders con skipTrailing no mira las trailing (las deja para el carril rápido)", async () => {
  const m = await buyAndTrail(5);
  setPrice(MEME, 0.02);
  await checkHotOrders(); // el carril rápido es quien actualiza el máximo (~0,01994)
  setPrice(MEME, 0.018); // caída que dispararía la trailing
  await checkOrders({ skipTrailing: true });
  assert.ok(bal(m, MEME) > 0, "con skipTrailing no dispara");

  await checkOrders(); // el chequeo completo sí
  assert.equal(bal(m, MEME), 0);
});
