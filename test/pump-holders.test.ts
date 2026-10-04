// pump_holders: top holders de pump.fun con flags de riesgo (dev, sniper, bundler).
import assert from "node:assert/strict";
import { test } from "node:test";
import { setFetchImpl } from "../src/market/http.js";
import { pumpHolders } from "../src/market/pump.js";

const MINT = "H7TuvDxEKygh27zGfGcjKG8JGWgrbyKpPtvJEpGosfas";

test("pump_holders resume dev, snipers y bundlers", async () => {
  setFetchImpl((async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("top-holders")) {
      return new Response(
        JSON.stringify({
          topHolders: [
            { address: "DevWallet111111111111111111111111111111", amount: 1000000, isDev: true, isSniper: false, isBundler: false },
            { address: "SniperWallet1111111111111111111111111111", amount: 500000, isDev: false, isSniper: true, isBundler: true },
            { address: "NormalWallet1111111111111111111111111111", amount: 200000, isDev: false, isSniper: false, isBundler: false },
          ],
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch);

  const r = await pumpHolders(MINT);
  const summary = r.summary as { holders: number; devStillHolding: boolean; snipers: number; bundlers: number };
  assert.equal(summary.holders, 3);
  assert.equal(summary.devStillHolding, true);
  assert.equal(summary.snipers, 1);
  assert.equal(summary.bundlers, 1);
  const holders = r.holders as Array<{ flags: string }>;
  assert.match(holders[0].flags, /dev/);
  assert.match(holders[1].flags, /sniper.*bundler|bundler.*sniper/);
  assert.equal(holders[2].flags, "—");
});
