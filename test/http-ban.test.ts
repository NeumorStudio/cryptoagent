import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchJson, isNoRouteError, setFetchImpl } from "../src/market/http.js";

test("sin ruta de venta frente a un fallo de red", () => {
  assert.ok(isNoRouteError(new Error("Sin ruta de swap en base: HTTP 400 en https://aggregator-api.kyberswap.com/base/api/v1/routes?x")));
  assert.ok(isNoRouteError(new Error('HTTP 400 en https://lite-api.jup.ag/swap/v1/quote?x: {"errorCode":"COULD_NOT_FIND_ANY_ROUTE"}')));
  assert.ok(!isNoRouteError(new Error("HTTP 429 en https://lite-api.jup.ag/swap/v1/quote?x")));
  assert.ok(!isNoRouteError(new Error("Sin ruta de swap en bsc: HTTP 503 en https://aggregator-api.kyberswap.com; fetch failed")));
  assert.ok(!isNoRouteError(new Error("The operation was aborted due to timeout")));
});

test("si Binance bloquea la IP, nadie vuelve a llamarle hasta que termine el bloqueo", async () => {
  let calls = 0;
  const until = Date.now() + 60_000;
  setFetchImpl(async () => {
    calls++;
    return new Response(JSON.stringify({ code: -1003, msg: `Way too much request weight used; IP banned until ${until}.` }), { status: 418 });
  });
  await assert.rejects(fetchJson("https://api.binance.com/api/v3/depth?symbol=SOLUSDT&limit=100"), /HTTP 418/);
  await assert.rejects(fetchJson("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT"), /bloqueado temporalmente/);
  assert.equal(calls, 1);
  // Los demás servicios siguen funcionando.
  setFetchImpl(async () => new Response("{}", { status: 200 }));
  assert.deepEqual(await fetchJson("https://api.dexscreener.com/x"), {});
});
