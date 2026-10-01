// Tras una transacción propia, las lecturas frescas se hacen en un bloque concreto, nunca anterior al de esa
// transacción: un nodo que aún no lo tiene da error y se reintenta, en lugar de devolver un saldo viejo (M22 y M23:
// el RPC público de Base reparte incluso los elementos de un lote entre nodos distintos).
import assert from "node:assert/strict";
import { test } from "node:test";
import { setFetchImpl } from "../src/market/http.js";
import { requireBlock, rpcBatch } from "../src/market/evm.js";

test("una lectura fresca tras una transacción se hace en su bloque y reintenta si el nodo aún no lo tiene", async () => {
  process.env.NODE_BEHIND_WAIT_MS = "10000";
  const asked: string[] = [];
  let misses = 1;
  setFetchImpl((async (_input: string | URL | Request, init?: RequestInit) => {
    const calls = JSON.parse(String(init?.body)) as Array<{ id: number; method: string; params: unknown[] }>;
    return new Response(
      JSON.stringify(
        calls.map((c) => {
          // El nodo que contesta el número de bloque va por detrás (99) del de la transacción (100).
          if (c.method === "eth_blockNumber") return { id: c.id, result: "0x63" };
          asked.push(String(c.params[1]));
          // La primera vez, el nodo que lee el saldo aún no tiene el bloque 100.
          if (misses-- > 0) return { id: c.id, error: { message: "header not found" } };
          return { id: c.id, result: "0x0" };
        }),
      ),
      { status: 200 },
    );
  }) as typeof fetch);
  requireBlock("base", 100n);
  const [bal] = await rpcBatch("base", [{ method: "eth_getBalance", params: ["0xabc", "latest"] }], 0);
  assert.equal(bal, "0x0");
  // Nunca se pidió "latest" ni un bloque anterior: siempre el 100 (0x64).
  assert.deepEqual(asked, ["0x64", "0x64"]);
});

test("las lecturas con caché no se ven afectadas, y un revert no se reintenta", async () => {
  const methods: string[] = [];
  setFetchImpl((async (_input: string | URL | Request, init?: RequestInit) => {
    const calls = JSON.parse(String(init?.body)) as Array<{ id: number; method: string }>;
    methods.push(...calls.map((c) => c.method));
    return new Response(
      JSON.stringify(calls.map((c) => (c.method === "eth_call" ? { id: c.id, error: { message: "execution reverted" } } : { id: c.id, result: "0x5" }))),
      { status: 200 },
    );
  }) as typeof fetch);
  requireBlock("base", 100n);
  const [cached] = await rpcBatch("base", [{ method: "eth_getBalance", params: ["0xdef", "latest"] }], 5_000);
  assert.equal(cached, "0x5");
  assert.deepEqual(methods, ["eth_getBalance"]);
  await assert.rejects(rpcBatch("base", [{ method: "eth_call", params: [{}, "latest"] }], 0), /reverted/);
});

test("una lectura fresca en un bloque concreto (el de un swap) también se reintenta si el nodo aún no lo tiene", async () => {
  let misses = 2;
  setFetchImpl((async (_input: string | URL | Request, init?: RequestInit) => {
    const calls = JSON.parse(String(init?.body)) as Array<{ id: number; method: string }>;
    return new Response(
      JSON.stringify(calls.map((c) => (misses-- > 0 ? { id: c.id, error: { message: "header not found" } } : { id: c.id, result: "0x7" }))),
      { status: 200 },
    );
  }) as typeof fetch);
  const [bal] = await rpcBatch("bsc", [{ method: "eth_getBalance", params: ["0xabc", "0x1234"] }], 0);
  assert.equal(bal, "0x7");
});
