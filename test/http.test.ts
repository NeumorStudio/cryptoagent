import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchJson, fetchText, setFetchImpl, takeBudget } from "../src/market/http.js";

function fakeFetch() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  setFetchImpl((async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ n: calls.length }), { status: 200 });
  }) as typeof fetch);
  return calls;
}

test("GET: peticiones repetidas salen de la caché", async () => {
  const calls = fakeFetch();
  const a = await fetchJson<{ n: number }>("https://example.test/a");
  const b = await fetchJson<{ n: number }>("https://example.test/a");
  assert.equal(a.n, 1);
  assert.equal(b.n, 1);
  assert.equal(calls.length, 1);
});

test("POST: envía JSON y la caché distingue por cuerpo", async () => {
  const calls = fakeFetch();
  await fetchJson("https://example.test/rpc", { method: "POST", body: { id: 1 } });
  await fetchJson("https://example.test/rpc", { method: "POST", body: { id: 1 } });
  await fetchJson("https://example.test/rpc", { method: "POST", body: { id: 2 } });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]!.init?.method, "POST");
  assert.equal(calls[0]!.init?.body, JSON.stringify({ id: 1 }));
  assert.equal((calls[0]!.init?.headers as Record<string, string>)["content-type"], "application/json");
});

test("los errores HTTP no se guardan en caché", async () => {
  let n = 0;
  setFetchImpl((async () => new Response("no", { status: ++n === 1 ? 500 : 200 })) as unknown as typeof fetch);
  assert.equal((await fetchText("https://example.test/err")).status, 500);
  assert.equal((await fetchText("https://example.test/err")).status, 200);
});

test("cupo por ventana: se agota y se renueva", () => {
  assert.equal(takeBudget("budget.test", 2, 60_000), true);
  assert.equal(takeBudget("budget.test", 2, 60_000), true);
  assert.equal(takeBudget("budget.test", 2, 60_000), false);
  // Con una ventana ya vencida, vuelve a empezar.
  assert.equal(takeBudget("budget.test", 2, 0), true);
});
