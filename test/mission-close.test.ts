import assert from "node:assert/strict";
import { test } from "node:test";
import { db } from "../src/db.js";
import { USDC_MINT } from "../src/market/jupiter.js";
import { checkMission, createMission, getMission } from "../src/sim/mission.js";
import { valuation } from "../src/sim/portfolio.js";
import { installFakeMarket } from "./fake-market.js";

installFakeMarket();

test("un token sin ruta de venta vale 0 y no impide cerrar una misión que ya tiene el objetivo en efectivo", async () => {
  const m = await createMission(100, 105, 60, undefined, { solana: 100 });
  const RUG = "RuG1111111111111111111111111111111111111pump";
  db.prepare("UPDATE holdings SET amount = 110 WHERE mission_id = ? AND venue = 'solana' AND asset = ?").run(m.id, USDC_MINT);
  db.prepare("INSERT INTO holdings (mission_id, venue, asset, symbol, decimals, amount) VALUES (?, 'solana', ?, 'RUG', 6, 1000000)").run(m.id, RUG);

  const v = await valuation(m.id);
  const rug = v.holdings.find((h) => h.asset === RUG)!;
  assert.equal(rug.usd, 0);
  assert.match(rug.valuedBy, /sin ruta de venta/);
  assert.equal(v.reliable, true);

  const log = await checkMission(m.id);
  assert.match(log.join("\n"), /CONSEGUIDA/);
  assert.equal(getMission(m.id)!.status, "succeeded");
});

test("sin cierre al objetivo: tocarlo no termina la misión; al final del plazo cuenta si vale el objetivo o más", async () => {
  const setUsdc = (id: number, usd: number) => db.prepare("UPDATE holdings SET amount = ? WHERE mission_id = ? AND venue = 'solana' AND asset = ?").run(usd, id, USDC_MINT);
  const expire = (id: number) => db.prepare("UPDATE missions SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), id);

  const up = await createMission(100, 105, 60, undefined, { solana: 100 }, { closeOnTarget: false });
  setUsdc(up.id, 110);
  assert.deepEqual(await checkMission(up.id), [], "por encima del objetivo, pero con plazo: sigue");
  assert.equal(getMission(up.id)!.status, "active");
  expire(up.id);
  const log = await checkMission(up.id);
  assert.match(log.join("\n"), /CONSEGUIDA.*\(\+\d+\.\d %; objetivo 105 USD\)/);
  assert.equal(getMission(up.id)!.status, "succeeded");

  const down = await createMission(100, 105, 60, undefined, { solana: 100 }, { closeOnTarget: false });
  setUsdc(down.id, 90);
  expire(down.id);
  assert.match((await checkMission(down.id)).join("\n"), /TERMINADA POR TIEMPO.*\(-\d+\.\d %/);
  assert.equal(getMission(down.id)!.status, "expired");
});
