// Dentro del firmante: comprobar la transacción con la política, simularla, firmarla, enviarla y
// esperar a que se confirme. Es el único sitio donde se usan las claves privadas.
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, bsc } from "viem/chains";
import { EVM_CHAINS } from "../../market/evm.js";
import { solanaRpcUrl } from "../chain.js";
import type { Accounts } from "../keystore.js";
import { checkEvmTx, checkSolanaTx, type EvmTxRequest } from "../policy.js";

export interface SendResult {
  hash: string;
  ok: boolean;
  /** Motivo si la transacción se incluyó pero falló (se pagó la red igualmente). */
  error?: string;
}

export class PolicyError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendSolana(accounts: Accounts, txBase64: string): Promise<SendResult> {
  const tx = VersionedTransaction.deserialize(Buffer.from(txBase64, "base64"));
  const problems = checkSolanaTx(tx, accounts.solana.address);
  if (problems.length) throw new PolicyError(`El firmante rechaza la transacción: ${problems.join("; ")}`);
  const conn = new Connection(solanaRpcUrl(), "confirmed");
  tx.sign([Keypair.fromSecretKey(accounts.solana.secretKey)]);
  // Si la simulación falla, no se envía (no se paga nada).
  const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: false });
  if (sim.value.err) throw new Error(`La simulación falla, no se envía: ${JSON.stringify(sim.value.err)} ${(sim.value.logs ?? []).slice(-3).join(" | ")}`);
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

const VIEM_CHAINS = { 8453: base, 56: bsc } as const;

export async function sendEvm(accounts: Accounts, tx: EvmTxRequest, kind: "swap" | "approve"): Promise<SendResult> {
  const problems = checkEvmTx(tx, kind, accounts.evm.address);
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
