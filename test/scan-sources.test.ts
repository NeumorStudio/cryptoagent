// La liquidez de los candidatos de scan_market sale siempre de la misma medida (Jupiter, la que usan riskCheck y la
// memoria) cuando la hay, aunque otra fuente responda antes: DexScreener y GeckoTerminal suman los dos lados del pool.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setFetchImpl } from "../src/market/http.js";
import { scanMarket } from "../src/market/research.js";

const MINT = "Scan111111111111111111111111111111111111pump";
const ONLY_GECKO = "Gcko111111111111111111111111111111111111pump";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test("scan_market: la liquidez de Jupiter manda aunque GeckoTerminal responda antes", async () => {
  setFetchImpl((async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.host === "lite-api.jup.ag" && url.pathname.includes("toptrending")) {
      await new Promise((r) => setTimeout(r, 100));
      return json([{ id: MINT, symbol: "SCAN", liquidity: 10_000, stats5m: { priceChange: 30 }, stats1h: { priceChange: 50 } }]);
    }
    if (url.host === "api.geckoterminal.com") {
      const pool = (mint: string, reserve: string) => ({
        relationships: { base_token: { data: { id: `solana_${mint}` } } },
        attributes: { name: "X / SOL", reserve_in_usd: reserve, price_change_percentage: { m5: "5", h1: "9" } },
      });
      return json({ data: [pool(MINT, "21000"), pool(ONLY_GECKO, "40000")] });
    }
    return json({ error: "not found" }, 404);
  }) as typeof fetch);

  const r = await scanMarket(10);
  const c = r.candidates.find((x) => x.mint === MINT)!;
  assert.equal(c.liquidityUsd, 10_000);
  assert.equal(c.priceChange5mPct, 30);
  assert.equal(c.priceChange1hPct, 50);
  assert.match(String(c.liquiditySource), /^jupiter/);
  const g = r.candidates.find((x) => x.mint === ONLY_GECKO)!;
  assert.equal(g.liquidityUsd, 40_000);
  assert.equal(g.liquiditySource, "geckoterminal_trending");
});
