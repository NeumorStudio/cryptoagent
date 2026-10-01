// Tras una transacción propia, las lecturas frescas no aceptan un nodo que aún no tenga su bloque (M22: saldo viejo
// en Base que contó un puente dos veces).
import assert from "node:assert/strict";
import { test } from "node:test";
import { setFetchImpl } from "../src/market/http.js";
import { requireBlock, rpcBatch } from "../src/market/evm.js";

test("una lectura fresca salta los nodos que van por detrás del bloque de la última transacción", async () => {
  const seen: string[] = [];
  setFetchImpl((async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push(url);
    const calls = JSON.parse(String(init?.body)) as Array<{ id: number; method: string }>;
    // El primer RPC va por detrás (bloque 99, saldo viejo); el de reserva ya tiene el bloque 100.
    const behind = url.includes("mainnet.base.org");
    return new Response(
      JSON.stringify(calls.map((c) => ({ id: c.id, result: c.method === "eth_blockNumber" ? (behind ? "0x63" : "0x64") : behind ? "0x5" : "0x0" }))),
      { status: 200 },
    );
  }) as typeof fetch);
  requireBlock("base", 100n);
  const [bal] = await rpcBatch("base", [{ method: "eth_getBalance", params: ["0xabc", "latest"] }], 0);
  assert.equal(bal, "0x0");
  assert.ok(seen.length >= 2);
  // Las lecturas con caché (precios, metadatos) no se ven afectadas: no piden el número de bloque.
  seen.length = 0;
  const [cached] = await rpcBatch("base", [{ method: "eth_getBalance", params: ["0xdef", "latest"] }], 5_000);
  assert.equal(cached, "0x5");
  assert.equal(seen.length, 1);
});
