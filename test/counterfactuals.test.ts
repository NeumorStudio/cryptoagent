// Contrafactuales con velas de 1 minuto: el precio de un instante no puede salir del futuro (el cierre de la vela en
// curso), una operación de segundos no se puede medir con ellas, y el máximo dentro del minuto se da aparte.
import assert from "node:assert/strict";
import { test } from "node:test";
import { db } from "../src/db.js";
import { setFetchImpl } from "../src/market/http.js";
import { missionCounterfactuals } from "../src/sim/counterfactuals.js";
import { createMission } from "../src/sim/mission.js";
import { installFakeMarket } from "./fake-market.js";

installFakeMarket();
const m = await createMission(100, 110, 60, undefined, { solana: 100 });

// Velas de un token: la de base-60 cierra en 1; la de base abre en 1, llega a 1,7 y cierra en 2; luego sube.
const base = Math.floor(Date.now() / 1000 / 60) * 60 - 3600;
const candles: Array<[number, number, number, number, number]> = [[base - 60, 1, 1, 1, 1], [base, 1, 1.7, 1, 2]];
for (let i = 1; i < 50; i++) candles.push([base + i * 60, 2 + i, 2 + i, 2 + i, 2 + i]);
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
setFetchImpl((async (input: string | URL | Request) => {
  const url = String(input);
  if (url.includes("/pools?page=1")) return json({ data: [{ attributes: { address: "POOL", reserve_in_usd: "10000" } }] });
  if (url.includes("/ohlcv/minute")) return json({ data: { attributes: { ohlcv_list: candles } } });
  return new Response("{}", { status: 404 });
}) as typeof fetch);

const insert = (asset: string, openSec: number, closeSec: number, proceeds: number) =>
  db
    .prepare(
      `INSERT INTO positions (mission_id, venue, asset, symbol, opened_at, closed_at, status, qty_open, cost_open_usd, realized_cost_usd, realized_proceeds_usd, entry_features, research)
       VALUES (?, 'solana', ?, ?, ?, ?, 'closed', 0, 0, 10, ?, '{}', '{}')`,
    )
    .run(m.id, asset, asset, new Date(openSec * 1000).toISOString(), new Date(closeSec * 1000).toISOString(), proceeds);

test("una operación de segundos no se mide con velas de 1 minuto, y el máximo del minuto se da aparte", async () => {
  insert("Short", base + 3, base + 12, 14.5);
  const cf = (await missionCounterfactuals(m.id)).find((c) => c.symbol === "Short")!;
  assert.match(String(cf.unreliable), /operación de 9 s: las velas de 1 min no la miden/);
  assert.equal(cf.highWhileHeldPct, 70);
  assert.doesNotMatch(String(cf.reading), /nunca llegó a ir en positivo/);
});

test("el precio de entrada es el de antes de comprar, no el cierre de la vela en curso", async () => {
  // Entra a los 10 s de la vela de base y sale a los 310 s: la entrada es el cierre de base-60 (1), no el de base (2);
  // la salida, el cierre de la última vela terminada antes (base+240, que cierra en 6).
  insert("Long", base + 10, base + 310, 60);
  const cf = (await missionCounterfactuals(m.id)).find((c) => c.symbol === "Long")!;
  assert.equal(cf.marketMovePct, 500);
  assert.equal(cf.unreliable, undefined);
});
