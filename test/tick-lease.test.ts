// Un solo proceso hace el trabajo de fondo (órdenes y misión): los demás lo ceden mientras el turno esté vigente.
import assert from "node:assert/strict";
import { test } from "node:test";
import { db, holdsTickLease, setMeta } from "../src/db.js";

test("el turno del trabajo de fondo es de un solo proceso y se hereda cuando caduca", () => {
  db.prepare("DELETE FROM meta WHERE key = 'tick_lease'").run();
  assert.equal(holdsTickLease(), true, "lo toma el primero");
  assert.equal(holdsTickLease(), true, "y lo renueva");
  setMeta("tick_lease", `otro-proceso@${Date.now() + 30_000}`);
  assert.equal(holdsTickLease(), false, "otro lo tiene vigente");
  setMeta("tick_lease", `otro-proceso@${Date.now() - 1}`);
  assert.equal(holdsTickLease(), true, "caducado: lo toma este");
});

test("el cierre reintenta los fallos pasajeros (429, red) y no los definitivos", async () => {
  const { isTransientError } = await import("../src/market/http.js");
  assert.equal(isTransientError(new Error("HTTP 429 en https://lite-api.jup.ag/swap/v1/quote: Rate limit exceeded")), true);
  assert.equal(isTransientError(new Error("fetch failed")), true);
  assert.equal(isTransientError(new Error("Saldo insuficiente: tienes 1 USDC")), false);
  assert.equal(isTransientError(new Error("Jupiter: COULD_NOT_FIND_ANY_ROUTE")), false);
});

test("una petición con ttl corto no recibe la respuesta que otra guardó con ttl largo", async () => {
  const { fetchJson, setFetchImpl } = await import("../src/market/http.js");
  let calls = 0;
  setFetchImpl((async () => new Response(JSON.stringify({ n: ++calls }), { status: 200 })) as typeof fetch);
  const url = "https://example.test/quote?x=1";
  assert.equal((await fetchJson<{ n: number }>(url, { ttlMs: 10_000 })).n, 1);
  assert.equal((await fetchJson<{ n: number }>(url, { ttlMs: 10_000 })).n, 1, "con el mismo ttl se reutiliza");
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await fetchJson<{ n: number }>(url, { ttlMs: 1 })).n, 2, "la del momento vuelve a pedirla");
});
