// Recuperar la renta de las cuentas de token vacías en Solana. Cada token necesita su cuenta y crearla deja ~0,0015 SOL
// de renta (~0,17 $); al venderlo todo, la cuenta queda abierta con saldo 0 y esa renta no vuelve. En la M26 fue el
// mayor coste de la misión (~1,5 % del capital por token). Cerrarla devuelve la renta a la cartera.
//
// No se cierran las de los estables: se usan continuamente y recrearlas costaría la renta otra vez.
import { PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { getChain } from "../sim/venues/index.js";
import { solanaRpc } from "./chain.js";
import { signTx } from "./client.js";
import { livePub } from "./sync.js";

const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];
/** Cuántas cuentas se cierran en una transacción (cada cierre son 3 cuentas; cabe holgado). */
const MAX_PER_TX = 8;

interface ParsedTokenAccount {
  pubkey: string;
  account: { lamports: number; data: { parsed: { info: { mint: string; tokenAmount: { amount: string } } } } };
}

/**
 * Cierra las cuentas de token vacías de la cartera (o solo las de los tokens indicados) y devuelve lo recuperado.
 * Lo firma el firmante como operación "close", que solo admite cierres de cuentas propias hacia la propia cartera.
 */
export async function closeEmptyTokenAccounts(onlyMints?: string[]): Promise<{ closed: number; recoveredSol: number; txHash: string } | null> {
  const pub = livePub();
  const stables = new Set(getChain("solana").stables.map((s) => s.address));
  const empty: Array<{ address: string; program: string; lamports: number }> = [];
  for (const program of TOKEN_PROGRAMS) {
    const { value } = await solanaRpc<{ value: ParsedTokenAccount[] }>(
      "getTokenAccountsByOwner",
      [pub.solana, { programId: program }, { encoding: "jsonParsed", commitment: "confirmed" }],
      0,
    );
    for (const a of value) {
      const info = a.account.data.parsed.info;
      if (info.tokenAmount.amount !== "0" || stables.has(info.mint)) continue;
      if (onlyMints && !onlyMints.includes(info.mint)) continue;
      empty.push({ address: a.pubkey, program, lamports: a.account.lamports });
    }
  }
  if (!empty.length) return null;
  const batch = empty.slice(0, MAX_PER_TX);
  const owner = new PublicKey(pub.solana);
  const instructions = batch.map(
    (a) =>
      new TransactionInstruction({
        programId: new PublicKey(a.program),
        keys: [
          { pubkey: new PublicKey(a.address), isSigner: false, isWritable: true },
          { pubkey: owner, isSigner: false, isWritable: true },
          { pubkey: owner, isSigner: true, isWritable: false },
        ],
        data: Buffer.from([9]), // CloseAccount: la renta vuelve a la cartera
      }),
  );
  const { value } = await solanaRpc<{ value: { blockhash: string } }>("getLatestBlockhash", [{ commitment: "confirmed" }], 0);
  const message = new TransactionMessage({ payerKey: owner, recentBlockhash: value.blockhash, instructions }).compileToV0Message();
  const tx = Buffer.from(new VersionedTransaction(message).serialize()).toString("base64");
  const res = await signTx({ chain: "solana", kind: "close", usd: 0, solanaTx: tx, budget: { lamports: "20000", tokens: {} } });
  if (!res.ok) throw new Error(`No se pudieron cerrar las cuentas vacías: ${res.error}`);
  return { closed: batch.length, recoveredSol: batch.reduce((s, a) => s + a.lamports, 0) / 1e9, txHash: res.hash };
}
