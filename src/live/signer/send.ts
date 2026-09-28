// Dentro del firmante: comprobar la transacción con la política, simularla, firmarla, enviarla y
// esperar a que se confirme. Es el único sitio donde se usan las claves privadas.
import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, bsc } from "viem/chains";
import { EVM_CHAINS } from "../../market/evm.js";
import { solanaRpcUrl } from "../chain.js";
import type { Accounts } from "../keystore.js";
import {
  checkEvmTx,
  checkSolanaSpend,
  checkSolanaTx,
  parseTokenAccount,
  type AccountState,
  type EvmTxLimits,
  type EvmTxRequest,
  type SolanaSpendBudget,
} from "../policy.js";

export interface SendResult {
  hash: string;
  ok: boolean;
  /** Motivo si la transacción se incluyó pero falló (se pagó la red igualmente). */
  error?: string;
}

export class PolicyError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];

export interface SolanaSendOptions {
  bridge: boolean;
  budget: SolanaSpendBudget;
}

export async function sendSolana(accounts: Accounts, txBase64: string, opts: SolanaSendOptions): Promise<SendResult> {
  const tx = VersionedTransaction.deserialize(Buffer.from(txBase64, "base64"));
  const owner = accounts.solana.address;
  const problems = checkSolanaTx(tx, owner, { bridge: opts.bridge });
  if (problems.length) throw new PolicyError(`El firmante rechaza la transacción: ${problems.join("; ")}`);
  const conn = new Connection(solanaRpcUrl(), "confirmed");
  tx.sign([Keypair.fromSecretKey(accounts.solana.secretKey)]);

  // Estado de las cuentas de la cartera que la transacción puede modificar (las escribibles que aparecen
  // en ella, también desde tablas de direcciones), antes y (simulado) después. Ningún programa puede
  // tocar una cuenta que no esté en la transacción.
  const writable = await writableAccounts(conn, tx);
  const ownerKey = new PublicKey(owner);
  const pre: AccountState[] = [{ address: owner, lamports: BigInt(await conn.getBalance(ownerKey)) }];
  for (const programId of TOKEN_PROGRAMS) {
    const { value } = await conn.getTokenAccountsByOwner(ownerKey, { programId: new PublicKey(programId) });
    for (const a of value) {
      if (!writable.has(a.pubkey.toBase58())) continue;
      const t = parseTokenAccount(a.account.data);
      if (t) pre.push({ address: a.pubkey.toBase58(), lamports: BigInt(a.account.lamports), ...t });
    }
  }
  if (pre.length > 15) throw new PolicyError("La transacción toca demasiadas cuentas de la cartera para comprobarla: no se firma");
  // Si la simulación falla, no se envía (no se paga nada).
  const sim = await conn.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: false,
    accounts: { encoding: "base64", addresses: pre.map((a) => a.address) },
  });
  if (sim.value.err) throw new Error(`La simulación falla, no se envía: ${JSON.stringify(sim.value.err)} ${(sim.value.logs ?? []).slice(-3).join(" | ")}`);
  const post = new Map<string, AccountState | null>();
  pre.forEach((a, i) => {
    const acc = sim.value.accounts?.[i];
    if (!acc) return post.set(a.address, null);
    const data = Buffer.from(acc.data[0], "base64");
    post.set(a.address, { address: a.address, lamports: BigInt(acc.lamports), ...(a.mint ? (parseTokenAccount(data) ?? {}) : {}) });
  });
  const spend = checkSolanaSpend(owner, pre, post, opts.budget);
  if (spend.length) throw new PolicyError(`El firmante rechaza la transacción: ${spend.join("; ")}`);
  const raw = tx.serialize();
  const hash = await conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 });
  // Se reenvía cada 2 s hasta que se confirma o caduca el blockhash (~60-90 s).
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const { value } = await conn.getSignatureStatuses([hash]);
    const st = value[0];
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") {
      return st.err ? { hash, ok: false, error: `la transacción falló en la cadena: ${JSON.stringify(st.err)}` } : { hash, ok: true };
    }
    await conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => undefined);
    await sleep(2_000);
  }
  return { hash, ok: false, error: "no se confirmó a tiempo (puede que no se haya incluido): revisa el explorador" };
}

/** Cuentas escribibles de una transacción, incluidas las que vienen de tablas de direcciones. */
async function writableAccounts(conn: Connection, tx: VersionedTransaction): Promise<Set<string>> {
  const msg = tx.message;
  const keys = msg.staticAccountKeys;
  const out = new Set<string>();
  keys.forEach((k, i) => msg.isAccountWritable(i) && out.add(k.toBase58()));
  for (const lookup of msg.addressTableLookups) {
    const table = (await conn.getAddressLookupTable(lookup.accountKey)).value;
    if (!table) throw new PolicyError("No se puede leer una tabla de direcciones de la transacción: no se firma");
    for (const i of lookup.writableIndexes) out.add(table.state.addresses[i]!.toBase58());
  }
  return out;
}

const VIEM_CHAINS ={ 8453: base, 56: bsc } as const;

export async function sendEvm(accounts: Accounts, tx: EvmTxRequest, kind: "swap" | "approve" | "bridge", limits?: EvmTxLimits): Promise<SendResult> {
  const problems = checkEvmTx(tx, kind, accounts.evm.address, limits);
  if (problems.length) throw new PolicyError(`El firmante rechaza la transacción: ${problems.join("; ")}`);
  const chain = VIEM_CHAINS[tx.chainId as 8453 | 56];
  const rpc = Object.values(EVM_CHAINS).find((c) => c.chainId === tx.chainId)!.rpc;
  const account = privateKeyToAccount(`0x${Buffer.from(accounts.evm.privateKey).toString("hex")}`);
  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain, transport: http(rpc) });
  const request = { to: tx.to as Hex, data: tx.data as Hex, value: BigInt(tx.value || "0") };
  // Estimar el gas es también la simulación: si revertiría, falla aquí y no se envía.
  let gasLimit: bigint;
  try {
    const estimated = await publicClient.estimateGas({ account, ...request });
    gasLimit = (estimated * 13n) / 10n;
  } catch (err) {
    throw new Error(`La simulación falla, no se envía: ${(err as Error).message.split("\n")[0]}`);
  }
  const hash = await wallet.sendTransaction({ ...request, gas: gasLimit, chain });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  return receipt.status === "success" ? { hash, ok: true } : { hash, ok: false, error: "la transacción revirtió en la cadena (se pagó el gas)" };
}
