// Llegada de un puente real: si Li.Fi dice DONE/PARTIAL con otro token (Mayan Fast MCTP en la M21 entregó USDC en
// Base en lugar de ETH), se anota el token que llegó de verdad, con sus decimales, y el diario lo dice.
import assert from "node:assert/strict";
import { test } from "node:test";
import { db, now } from "../src/db.js";
import { setFetchImpl } from "../src/market/http.js";
import { settleLiveTransfers } from "../src/live/bridge.js";

const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

test("un puente PARTIAL se anota con el token y los decimales que llegaron", async () => {
  const m = Number(
    db
      .prepare("INSERT INTO missions (created_at, initial_usd, target_usd, deadline, status, mode, approval, limits) VALUES (?, 13, 14, ?, 'active', 'live', 'manual', ?)")
      .run(now(), new Date(Date.now() + 3_600_000).toISOString(), JSON.stringify({ maxTradeUsd: 5, maxLossPct: 50 })).lastInsertRowid,
  );
  const carry = { live: { txHash: "FDAtmk7v", tool: "mayanFastMCTP" } };
  const id = Number(
    db
      .prepare(
        `INSERT INTO transfers (mission_id, session_id, created_at, arrives_at, status, kind, from_venue, to_venue, provider, asset_out, symbol_out, amount_out,
           asset_in, symbol_in, decimals_in, amount_in, value_usd, costs, carry)
         VALUES (?, NULL, ?, ?, 'pending', 'bridge', 'solana', 'base', 'Li.Fi (mayanFastMCTP)', 'So11111111111111111111111111111111111111112', 'SOL', 0.025,
           '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'ETH', 18, 0.00108837, 2.94, '[]', ?)`,
      )
      .run(m, now(), now(), JSON.stringify(carry)).lastInsertRowid,
  );
  setFetchImpl((async (input: string | URL | Request) => {
    if (String(input).includes("li.quest/v1/status")) {
      return new Response(
        JSON.stringify({
          status: "DONE",
          substatus: "PARTIAL",
          receiving: { amount: "2918239", txHash: "0x52b8", token: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6 } },
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch);

  const log = await settleLiveTransfers(m);
  assert.match(log.join("\n"), /Llegan 2\.918239 USDC a Base en lugar de ETH \(puente real #\d+, PARTIAL\)/);
  // Y avisa de que en Base no hay ETH para mover esos USDC.
  assert.match(log.join("\n"), /En Base tienes 0 ETH: sin ETH para el gas no podrás mover lo que llegue/);
  const t = db.prepare("SELECT status, asset_in, symbol_in, decimals_in, amount_in FROM transfers WHERE id = ?").get(id) as Record<string, unknown>;
  assert.deepEqual({ ...t }, { status: "settled", asset_in: BASE_USDC, symbol_in: "USDC", decimals_in: 6, amount_in: 2.918239 });
});

test("en una misión real, portfolio muestra las direcciones de la cartera de verdad", async () => {
  const { createWallet } = await import("../src/live/keystore.js");
  const { liveDir } = await import("../src/live/paths.js");
  const { valuation, evmAddress } = await import("../src/sim/portfolio.js");
  const { pub } = createWallet(liveDir(), "una contraseña larga de prueba");
  const m = Number(
    db
      .prepare("INSERT INTO missions (created_at, initial_usd, target_usd, deadline, status, mode, approval, limits) VALUES (?, 10, 11, ?, 'active', 'live', 'manual', ?)")
      .run(now(), new Date(Date.now() + 3_600_000).toISOString(), JSON.stringify({ maxTradeUsd: 5, maxLossPct: 50 })).lastInsertRowid,
  );
  const v = await valuation(m);
  assert.equal(v.evmWallet, pub.evm);
  assert.equal(v.solanaWallet, pub.solana);
  assert.notEqual(v.evmWallet, evmAddress(m));
});

test("Li.Fi: se excluyen siempre las rutas de Mayan MCTP y se puede pedir la más rápida o excluir otras", async () => {
  const { bridgeQuote } = await import("../src/market/lifi.js");
  const urls: string[] = [];
  setFetchImpl((async (input: string | URL | Request) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ tool: "relaydepository", estimate: { toAmount: "1000", executionDuration: 2, gasCosts: [], feeCosts: [] } }), { status: 200 });
  }) as typeof fetch);
  const q = { fromChain: "solana", toChain: "base", fromToken: "x", toToken: "y", fromAmount: 1000n, fromAddress: "a", toAddress: "b", slippage: 0.005 };
  await bridgeQuote(q);
  await bridgeQuote({ ...q, fromAmount: 1001n, route: "fastest", avoidBridges: ["mayan"] });
  assert.match(urls[0]!, /denyBridges=mayanFastMCTP,mayanMCTP(&|$)/);
  assert.doesNotMatch(urls[0]!, /order=/);
  assert.match(urls[1]!, /denyBridges=mayanFastMCTP,mayanMCTP,mayan&order=FASTEST/);
});

test("Li.Fi: con bridge solo se permite esa ruta, y Mayan MCTP no se puede fijar", async () => {
  const { bridgeQuote } = await import("../src/market/lifi.js");
  const urls: string[] = [];
  setFetchImpl((async (input: string | URL | Request) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ tool: "polymerStandard", estimate: { toAmount: "1000", executionDuration: 1100, gasCosts: [], feeCosts: [] } }), { status: 200 });
  }) as typeof fetch);
  const q = { fromChain: "base", toChain: "solana", fromToken: "x", toToken: "y", fromAmount: 2002n, fromAddress: "a", toAddress: "b", slippage: 0.005 };
  await bridgeQuote({ ...q, bridge: "polymerStandard" });
  assert.match(urls[0]!, /allowBridges=polymerStandard/);
  assert.doesNotMatch(urls[0]!, /denyBridges/);
  await assert.rejects(bridgeQuote({ ...q, fromAmount: 2003n, bridge: "mayanFastMCTP" }), /excluida siempre/);
});
