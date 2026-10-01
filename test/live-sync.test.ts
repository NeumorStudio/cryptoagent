// Los saldos reales se leen al momento: sin caché y, en Solana, con el nivel "confirmed". Si no, justo después de un
// puente el saldo de origen salía sin descontar y el dinero contaba dos veces (M21, primera misión real).
import assert from "node:assert/strict";
import { test } from "node:test";
import { setFetchImpl } from "../src/market/http.js";
import { readHoldings } from "../src/live/chain.js";

test("cada lectura de saldos va a la cadena y en Solana pide el nivel confirmed", async () => {
  let lamports = 1_000_000_000;
  const solanaCalls: Array<{ method: string; params: unknown[] }> = [];
  setFetchImpl((async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url.includes("solana")) {
      solanaCalls.push(body);
      const result = body.method === "getBalance" ? { value: lamports } : { value: [] };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
    }
    // EVM: todo a cero.
    const calls = Array.isArray(body) ? body : [body];
    return new Response(JSON.stringify(calls.map((c: { id: number }) => ({ jsonrpc: "2.0", id: c.id, result: "0x0" }))), { status: 200 });
  }) as typeof fetch);

  const pub = { solana: "So1anaOwner111111111111111111111111111111111", evm: "0x0000000000000000000000000000000000000001" } as Parameters<typeof readHoldings>[0];
  const first = await readHoldings(pub);
  assert.equal(first.holdings.find((h) => h.venue === "solana")!.amount, 1);
  lamports = 750_000_000; // sale un puente
  const second = await readHoldings(pub);
  assert.equal(second.holdings.find((h) => h.venue === "solana")!.amount, 0.75, "la segunda lectura no sale de la caché");
  for (const c of solanaCalls) assert.match(JSON.stringify(c.params), /"commitment":"confirmed"/, c.method);
});
