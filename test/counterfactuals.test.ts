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

test("si la venta real queda por debajo de lo más bajo de las velas, la lectura no es fiable (las velas no vieron el precio)", async () => {
  // Velas planas en 1 (mínimo 0,99) y una venta real a -8 %: diferencia de menos de 15 puntos, pero por debajo del mínimo.
  const flat: Array<[number, number, number, number, number]> = [];
  for (let i = -2; i < 50; i++) flat.push([base + i * 60, 1, 1.01, 0.99, 1]);
  setFetchImpl((async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/pools?page=1")) return json({ data: [{ attributes: { address: url.includes("Flat") ? "FLATPOOL" : "POOL", reserve_in_usd: "10000" } }] });
    if (url.includes("/ohlcv/minute")) return json({ data: { attributes: { ohlcv_list: url.includes("FLATPOOL") ? flat : candles } } });
    return new Response("{}", { status: 404 });
  }) as typeof fetch);
  insert("Flat", base + 10, base + 310, 9.2);
  const cf = (await missionCounterfactuals(m.id)).find((c) => c.symbol === "Flat")!;
  assert.equal(cf.lowWhileHeldPct, -1);
  assert.match(String(cf.unreliable), /por debajo de lo más bajo de las velas/);
});

test("también es poco fiable si la venta queda por encima de lo más alto de las velas, o si un stop no saltó aunque las velas bajan más", async () => {
  // Velas planas en 1 (máximo 1,01, mínimo 0,99) y una venta real a +8 %: por encima de lo más alto.
  const flat: Array<[number, number, number, number, number]> = [];
  for (let i = -2; i < 50; i++) flat.push([base + i * 60, 1, 1.01, 0.99, 1]);
  // Velas con una mecha a 0,7 (-30 %) y un stop a 0,85 que no saltó.
  const wick: Array<[number, number, number, number, number]> = [];
  for (let i = -2; i < 50; i++) wick.push([base + i * 60, 1, 1.01, i === 2 ? 0.7 : 0.99, 1]);
  setFetchImpl((async (input: string | URL | Request) => {
    const url = String(input);
    const pool = url.includes("Up") ? "UPPOOL" : url.includes("Wick") ? "WICKPOOL" : "POOL";
    if (url.includes("/pools?page=1")) return json({ data: [{ attributes: { address: pool, reserve_in_usd: "10000" } }] });
    if (url.includes("/ohlcv/minute")) return json({ data: { attributes: { ohlcv_list: url.includes("UPPOOL") ? flat : url.includes("WICKPOOL") ? wick : candles } } });
    return new Response("{}", { status: 404 });
  }) as typeof fetch);
  insert("Up", base + 10, base + 310, 10.8);
  insert("Wick", base + 10, base + 310, 9.5);
  db.prepare(
    `INSERT INTO orders (created_at, mission_id, venue, trigger_asset, trigger_label, condition, trigger_price, action, reasoning, status)
     VALUES (?, ?, 'solana', 'Wick', 'Wick/USD', 'below', 0.85, '{}', 'stop', 'cancelled')`,
  ).run(new Date((base + 20) * 1000).toISOString(), m.id);
  const cfs = await missionCounterfactuals(m.id);
  assert.match(String(cfs.find((c) => c.symbol === "Up")!.unreliable), /por encima de lo más alto/);
  assert.match(String(cfs.find((c) => c.symbol === "Wick")!.unreliable), /stop en -15 % no saltó/);
});
