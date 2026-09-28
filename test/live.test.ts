// Modo real: política del firmante, límites, cola de aprobación y que las herramientas no mezclen modos.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, TransactionInstruction } from "@solana/web3.js";
import { checkEvmTx, checkLimits, checkSolanaTx, JUPITER_PROGRAM } from "../src/live/policy.js";
import { createSignerServer } from "../src/live/signer/server.js";
import { createLiveMission, type Mission } from "../src/sim/mission.js";
import { runTool } from "../src/tools/index.js";
import { installFakeMarket } from "./fake-market.js";

installFakeMarket();

// ─── Política Solana ────────────────────────────────────────────────────────

const owner = Keypair.generate().publicKey;
const stranger = Keypair.generate().publicKey;
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const wsolAta = PublicKey.findProgramAddressSync(
  [owner.toBuffer(), TOKEN.toBuffer(), new PublicKey("So11111111111111111111111111111111111111112").toBuffer()],
  ATA,
)[0];

function tx(payer: PublicKey, ixs: TransactionInstruction[]) {
  const msg = new TransactionMessage({ payerKey: payer, recentBlockhash: "11111111111111111111111111111111", instructions: ixs }).compileToV0Message();
  return new VersionedTransaction(msg);
}
const jupiterIx = new TransactionInstruction({ programId: new PublicKey(JUPITER_PROGRAM), keys: [{ pubkey: owner, isSigner: true, isWritable: true }], data: Buffer.from([1, 2, 3]) });

test("Solana: un swap de Jupiter que envuelve SOL en la propia cuenta se acepta", () => {
  const wrap = SystemProgram.transfer({ fromPubkey: owner, toPubkey: wsolAta, lamports: 1000 });
  assert.deepEqual(checkSolanaTx(tx(owner, [wrap, jupiterIx]), owner.toBase58()), []);
});

test("Solana: se rechaza enviar SOL o tokens a otra cartera, programas desconocidos y otro pagador", () => {
  const steal = SystemProgram.transfer({ fromPubkey: owner, toPubkey: stranger, lamports: 1000 });
  assert.match(checkSolanaTx(tx(owner, [steal]), owner.toBase58()).join(), /no es de la IA/);
  const tokenTransfer = new TransactionInstruction({
    programId: TOKEN,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: stranger, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([3, 0, 0, 0, 0, 0, 0, 0, 1]),
  });
  assert.match(checkSolanaTx(tx(owner, [tokenTransfer]), owner.toBase58()).join(), /instrucción de token no permitida/);
  const weird = new TransactionInstruction({ programId: Keypair.generate().publicKey, keys: [], data: Buffer.alloc(0) });
  assert.match(checkSolanaTx(tx(owner, [weird]), owner.toBase58()).join(), /programa no permitido/);
  assert.match(checkSolanaTx(tx(stranger, [jupiterIx]), owner.toBase58()).join(), /quien paga/);
});

// ─── Política EVM ───────────────────────────────────────────────────────────

const ME = "0x695e7aE1E234bff3B0D0668240Fdf52D50b9a5bf";
const KYBER = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5";
const pad = (a: string) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");

test("EVM: swap en el router de Kyber hacia la propia cartera sí; otro contrato u otro destinatario no", () => {
  const data = `0xe21fd0e9${"0".repeat(64)}${pad(ME)}${"0".repeat(64)}`;
  assert.deepEqual(checkEvmTx({ chainId: 8453, to: KYBER, data, value: "0" }, "swap", ME), []);
  assert.match(checkEvmTx({ chainId: 8453, to: "0x000000000000000000000000000000000000dead", data, value: "0" }, "swap", ME).join(), /contrato no permitido/);
  assert.match(checkEvmTx({ chainId: 8453, to: KYBER, data: `0xe21fd0e9${"0".repeat(128)}`, value: "0" }, "swap", ME).join(), /destinatario/);
  assert.match(checkEvmTx({ chainId: 1, to: KYBER, data, value: "0" }, "swap", ME).join(), /cadena no permitida/);
});

test("EVM: approve solo al router y por una cantidad exacta", () => {
  const approve = (spender: string, amount: bigint) => `0x095ea7b3${pad(spender)}${amount.toString(16).padStart(64, "0")}`;
  assert.deepEqual(checkEvmTx({ chainId: 56, to: "0x55d398326f99059ff775485246999027b3197955", data: approve(KYBER, 10n ** 18n), value: "0" }, "approve", ME), []);
  assert.match(checkEvmTx({ chainId: 56, to: "0x55d3", data: approve(KYBER, (1n << 256n) - 1n), value: "0" }, "approve", ME).join(), /ilimitado/);
  assert.match(checkEvmTx({ chainId: 56, to: "0x55d3", data: approve("0x000000000000000000000000000000000000dead", 5n), value: "0" }, "approve", ME).join(), /no permitido/);
});

test("límites: máximo por operación y, por debajo de la pérdida máxima, solo vender", () => {
  const base = { maxTradeUsd: 10, maxLossPct: 30, initialUsd: 100, currentUsd: 95 };
  assert.deepEqual(checkLimits({ ...base, side: "buy", usd: 10 }), []);
  assert.match(checkLimits({ ...base, side: "buy", usd: 12 }).join(), /máximo por operación/);
  assert.match(checkLimits({ ...base, side: "buy", usd: 5, currentUsd: 69 }).join(), /pérdida máxima/);
  assert.deepEqual(checkLimits({ ...base, side: "sell", usd: 50, currentUsd: 10 }), []);
});

// ─── Firmante: intención, aprobación y firma ────────────────────────────────

const holdings = [{ venue: "solana" as const, asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", decimals: 6, amount: 100 }];
function liveMission(approval: "manual" | "auto"): Mission {
  return createLiveMission({
    holdings,
    totalUsd: 100,
    byChain: { solana: 100, base: 0, bsc: 0 },
    targetPct: 10,
    durationMinutes: 60,
    approval,
    limits: { maxTradeUsd: 25, maxLossPct: 30 },
  });
}

const dir = mkdtempSync(path.join(os.tmpdir(), "cryptoagent-live-"));
const token = "c".repeat(64);
let walletValue = 100;
const sent: string[] = [];
const signer = createSignerServer({
  dir,
  token,
  deps: {
    walletValueUsd: async () => walletValue,
    sendSolana: async (_a, b64) => (sent.push(b64), { hash: "sig" + sent.length, ok: true }),
    sendEvm: async () => ({ hash: "0xabc", ok: true }),
  },
});
const port = await signer.listen();
const origin = `http://127.0.0.1:${port}`;
after(() => signer.server.close());

const api = async (p: string, body: unknown) => {
  const r = await fetch(origin + p, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const page = (p: string, body?: unknown, cookie = "") =>
  fetch(origin + p, { method: body === undefined ? "GET" : "POST", headers: { origin, cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

test("firmante bloqueado: no concede nada", async () => {
  const m = liveMission("auto");
  const r = await api("/api/intent", { missionId: m.id, chain: "solana", side: "buy", usd: 5, summary: "x" });
  assert.equal(r.status, 423);
});

let cookie = "";
test("modo autónomo: dentro de los límites da ticket; fuera, no; el ticket de un swap se usa una vez", async () => {
  const created = await page("/wallet/create", { password: "contraseña de prueba" });
  cookie = created.headers.get("set-cookie")!.split(";")[0]!;
  const m = liveMission("auto");
  const over = await api("/api/intent", { missionId: m.id, chain: "solana", side: "buy", usd: 40, summary: "demasiado" });
  assert.equal(over.status, 403);
  assert.match(over.body.error, /máximo por operación/);
  const ok = await api("/api/intent", { missionId: m.id, chain: "solana", side: "buy", usd: 20, summary: "comprar" });
  assert.equal(ok.status, 200);
  // Otra cadena o más importe que el aprobado: no.
  assert.equal((await api("/api/sign", { ticket: ok.body.ticket, chain: "base", kind: "swap", usd: 20, evmTx: {} })).status, 403);
  assert.equal((await api("/api/sign", { ticket: ok.body.ticket, chain: "solana", kind: "swap", usd: 60, solanaTx: "AA" })).status, 403);
  const signed = await api("/api/sign", { ticket: ok.body.ticket, chain: "solana", kind: "swap", usd: 21, solanaTx: "AA" });
  assert.deepEqual([signed.status, signed.body.ok], [200, true]);
  assert.equal((await api("/api/sign", { ticket: ok.body.ticket, chain: "solana", kind: "swap", usd: 21, solanaTx: "AA" })).status, 403, "ticket ya usado");
  // Por debajo de la pérdida máxima: comprar no, vender sí.
  walletValue = 60;
  assert.equal((await api("/api/intent", { missionId: m.id, chain: "solana", side: "buy", usd: 5, summary: "x" })).status, 403);
  assert.equal((await api("/api/intent", { missionId: m.id, chain: "solana", side: "sell", usd: 50, summary: "vender" })).status, 200);
  walletValue = 100;
});

test("modo manual: la operación espera a que el usuario la apruebe o la rechace en su página", async () => {
  const m = liveMission("manual");
  const pendingIntent = api("/api/intent", { missionId: m.id, chain: "solana", side: "buy", usd: 10, summary: "Comprar MEME con 10 USDC" });
  let list: any[] = [];
  for (let i = 0; i < 20 && !list.length; i++) {
    await new Promise((r) => setTimeout(r, 50));
    list = await (await page("/wallet/pending", undefined, cookie)).json();
  }
  assert.equal(list[0].summary, "Comprar MEME con 10 USDC");
  // Sin la cookie del usuario no se puede aprobar.
  assert.equal((await page("/wallet/decide", { id: list[0].id, approve: true })).status, 401);
  assert.equal((await page("/wallet/decide", { id: list[0].id, approve: true }, cookie)).status, 200);
  const r = await pendingIntent;
  assert.equal(r.status, 200);
  assert.ok(r.body.ticket);

  const rejected = api("/api/intent", { missionId: m.id, chain: "solana", side: "buy", usd: 10, summary: "otra" });
  await new Promise((r) => setTimeout(r, 100));
  const [p] = await (await page("/wallet/pending", undefined, cookie)).json();
  await page("/wallet/decide", { id: p.id, approve: false }, cookie);
  assert.equal((await rejected).status, 403);
});

test("parar todo rechaza lo pendiente y bloquea la firma", async () => {
  const m = liveMission("manual");
  const waiting = api("/api/intent", { missionId: m.id, chain: "solana", side: "buy", usd: 10, summary: "x" });
  await new Promise((r) => setTimeout(r, 100));
  await page("/wallet/stop", {}, cookie);
  assert.equal((await waiting).status, 403);
  assert.equal((await api("/api/intent", { missionId: m.id, chain: "solana", side: "sell", usd: 1, summary: "x" })).status, 423);
});

test("las herramientas no mezclan modos: en una misión real no se simula ni se usa Binance", async () => {
  const m = liveMission("auto");
  const ctx = { sessionId: 1, missionId: m.id };
  const sim = await runTool("simulate_swap", { chain: "solana", input: "USDC", output: "SOL", amount: 1, thesis: { why: "x", evidence: "x", sources: ["x"], exit_plan: "x", beliefs_applied: [], memory_note: "x" } }, ctx);
  assert.equal(sim.isError, true);
  assert.match(String(sim.content), /execute_swap/);
  const bin = await runTool("simulate_binance_market_order", { symbol: "SOLUSDT", side: "BUY", amount: 10, thesis: { why: "x", evidence: "x", sources: ["x"], exit_plan: "x", beliefs_applied: [], memory_note: "x" } }, ctx);
  assert.equal(bin.isError, true);
  assert.match(String(bin.content), /REAL/);
});
