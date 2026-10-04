// trade_tape: cinta de operaciones de un token desde GeckoTerminal (lado relativo al token) y resumen
// del flujo de 5 minutos. Sin pool (p. ej. token en la curva de pump.fun) devuelve unavailable, no falla.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setFetchImpl } from "../src/market/http.js";
import { tradeTape } from "../src/market/tape.js";

const MEME = "MeMe1111111111111111111111111111111111111pump";

test("trade_tape: cinta con el lado relativo al token y resumen de 5 min", async () => {
  const nowIso = () => new Date().toISOString();
  setFetchImpl((async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.host !== "api.geckoterminal.com") return new Response(JSON.stringify({}), { status: 404 });
    if (url.pathname.endsWith("/pools")) {
      return new Response(JSON.stringify({ data: [{ attributes: { address: "POOL1", reserve_in_usd: "1000" } }] }), { status: 200 });
    }
    if (url.pathname.endsWith("/trades")) {
      return new Response(
        JSON.stringify({
          data: [
            { attributes: { block_timestamp: nowIso(), tx_from_address: "W1", tx_hash: "TX1", volume_in_usd: "100", from_token_address: MEME, to_token_address: "So11111111111111111111111111111111111111112" } },
            { attributes: { block_timestamp: nowIso(), tx_from_address: "W2", tx_hash: "TX2", volume_in_usd: "50", from_token_address: "So11111111111111111111111111111111111111112", to_token_address: MEME } },
          ],
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch);

  const tape = await tradeTape("solana", MEME, 10);
  assert.equal(tape.source, "GeckoTerminal pool trades");
  const trades = tape.trades as Array<{ side: string; usd?: number }>;
  assert.equal(trades.length, 2);
  // MEME → SOL es una venta de MEME; SOL → MEME es una compra.
  assert.equal(trades[0].side, "sell");
  assert.equal(trades[0].usd, 100);
  assert.equal(trades[1].side, "buy");
  assert.equal(trades[1].usd, 50);
  const summary = tape.summary as { buysUsd5m: number; sellsUsd5m: number; netUsd5m: number; buys5m: number; sells5m: number };
  assert.equal(summary.buys5m, 1);
  assert.equal(summary.sells5m, 1);
  assert.equal(summary.buysUsd5m, 50);
  assert.equal(summary.sellsUsd5m, 100);
  assert.equal(summary.netUsd5m, -50);
});

test("trade_tape: sin pool devuelve unavailable en vez de fallar", async () => {
  setFetchImpl((async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch);
  const tape = await tradeTape("solana", MEME, 10);
  assert.ok((tape as { unavailable?: string }).unavailable, "debería avisar de que no hay cinta");
});
