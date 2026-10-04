// Contrafactuales de operaciones cortas (< 2 min) con la cinta del pool (segundo a segundo): cuando hay
// operaciones disponibles se mide con ellas en lugar de marcar la operación como poco fiable.
import assert from "node:assert/strict";
import { test } from "node:test";
import { db } from "../src/db.js";
import { setFetchImpl } from "../src/market/http.js";
import { missionCounterfactuals } from "../src/sim/counterfactuals.js";
import { createMission } from "../src/sim/mission.js";

const m = await createMission(100, 110, 60, undefined, { solana: 100 });

const TOKEN = "Shorty1111111111111111111111111111111111111";
const base = Math.floor(Date.now() / 1000) - 3600;
// Operación de 9 s con cinta: 1,0 $ de entrada, pico a 1,5 $ y salida a 1,2 $.
const trades = [
  { attributes: { block_timestamp: new Date((base - 5) * 1000).toISOString(), from_token_address: "SOL", to_token_address: TOKEN, price_from_in_usd: "150", price_to_in_usd: "1.0" } },
  { attributes: { block_timestamp: new Date((base + 3) * 1000).toISOString(), from_token_address: TOKEN, to_token_address: "SOL", price_from_in_usd: "1.5", price_to_in_usd: "150" } },
  { attributes: { block_timestamp: new Date((base + 9) * 1000).toISOString(), from_token_address: TOKEN, to_token_address: "SOL", price_from_in_usd: "1.2", price_to_in_usd: "150" } },
];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
setFetchImpl((async (input: string | URL | Request) => {
  const url = String(input);
  if (url.includes("/pools?page=1")) return json({ data: [{ attributes: { address: "POOL", reserve_in_usd: "10000" } }] });
  if (url.includes("/trades")) return json({ data: trades });
  return new Response("{}", { status: 404 });
}) as typeof fetch);

test("una operación de segundos se mide con la cinta del pool cuando la hay", async () => {
  db.prepare(
    `INSERT INTO positions (mission_id, venue, asset, symbol, opened_at, closed_at, status, qty_open, cost_open_usd, realized_cost_usd, realized_proceeds_usd, entry_features, research)
     VALUES (?, 'solana', ?, 'SHORTY', ?, ?, 'closed', 0, 0, 10, 12, '{}', '{}')`,
  ).run(m.id, TOKEN, new Date(base * 1000).toISOString(), new Date((base + 9) * 1000).toISOString());

  const cf = (await missionCounterfactuals(m.id)).find((c) => c.symbol === "SHORTY")!;
  assert.equal(cf.unreliable, undefined, "ya no se marca poco fiable");
  assert.equal(cf.marketMovePct, 20); // 1,0 → 1,2
  assert.equal(cf.highWhileHeldPct, 50); // pico 1,5
  assert.match(String(cf.reading), /llegó a \+50 % mientras la tenía y salió en 20 %/);
});
