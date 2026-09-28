// Política del firmante: qué transacciones acepta firmar. Es la última barrera, independiente del
// modelo y del servidor MCP: aunque un prompt manipulado consiguiera pedir otra cosa, solo se firman
// swaps en agregadores conocidos que devuelven los fondos a la propia cartera, y approves a esos routers.
// No hay forma de enviar fondos a una dirección ajena.
import { PublicKey, VersionedTransaction } from "@solana/web3.js";

// ─── Solana ─────────────────────────────────────────────────────────────────

export const JUPITER_PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const WSOL_MINT = "So11111111111111111111111111111111111111112";

export const SOLANA_ALLOWED_PROGRAMS = new Set([JUPITER_PROGRAM, SYSTEM_PROGRAM, COMPUTE_BUDGET, TOKEN_PROGRAM, TOKEN_2022, ATA_PROGRAM]);

const ata = (owner: PublicKey, mint: string, tokenProgram: string) =>
  PublicKey.findProgramAddressSync([owner.toBuffer(), new PublicKey(tokenProgram).toBuffer(), new PublicKey(mint).toBuffer()], new PublicKey(ATA_PROGRAM))[0].toBase58();

/** Devuelve los motivos por los que NO se debe firmar (vacío = se puede firmar). */
export function checkSolanaTx(tx: VersionedTransaction, ownerAddress: string): string[] {
  const problems: string[] = [];
  const owner = new PublicKey(ownerAddress);
  const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
  // Las cuentas de las tablas de direcciones no se pueden comprobar aquí: se tratan como desconocidas.
  const key = (i: number) => keys[i] ?? null;
  if (keys[0] !== ownerAddress) problems.push("quien paga la transacción no es la cartera de la IA");
  const ownAccounts = new Set([ownerAddress, ata(owner, WSOL_MINT, TOKEN_PROGRAM), ata(owner, WSOL_MINT, TOKEN_2022)]);

  for (const ix of tx.message.compiledInstructions) {
    const program = key(ix.programIdIndex);
    const data = ix.data;
    if (!program || !SOLANA_ALLOWED_PROGRAMS.has(program)) {
      problems.push(`programa no permitido: ${program ?? "(desde una tabla de direcciones)"}`);
      continue;
    }
    if (program === SYSTEM_PROGRAM) {
      // Solo transferencias de SOL a la propia cuenta de SOL envuelto (para operar con SOL).
      const type = data.length >= 4 ? new DataView(data.buffer, data.byteOffset).getUint32(0, true) : -1;
      const to = key(ix.accountKeyIndexes[1] ?? -1);
      if (type !== 2 || !to || !ownAccounts.has(to)) problems.push("transferencia de SOL a una cuenta que no es de la IA");
    } else if (program === TOKEN_PROGRAM || program === TOKEN_2022) {
      const op = data[0];
      if (op === 17) continue; // SyncNative
      if (op === 9) {
        // CloseAccount: lo que queda vuelve a la propia cartera.
        if (key(ix.accountKeyIndexes[1] ?? -1) !== ownerAddress) problems.push("cierre de cuenta de token hacia otra cartera");
        continue;
      }
      problems.push(`instrucción de token no permitida (${op})`);
    } else if (program === ATA_PROGRAM) {
      // Crear una cuenta de token: la paga la IA y es de la IA.
      const payer = key(ix.accountKeyIndexes[0] ?? -1);
      const wallet = key(ix.accountKeyIndexes[2] ?? -1);
      if (payer !== ownerAddress || wallet !== ownerAddress) problems.push("crea una cuenta de token para otra cartera");
    }
    // Jupiter y Compute Budget: permitidos (Jupiter entrega la salida a la cuenta del usuario que se le indicó).
  }
  return problems;
}

// ─── EVM ────────────────────────────────────────────────────────────────────

/** Routers permitidos por cadena (KyberSwap MetaAggregationRouterV2, la misma dirección en todas). */
export const EVM_ROUTERS: Record<number, Set<string>> = {
  8453: new Set(["0x6131b5fae19ea4f9d964eac0408e4408b66337b5"]),
  56: new Set(["0x6131b5fae19ea4f9d964eac0408e4408b66337b5"]),
};
const APPROVE = "0x095ea7b3";
const MAX_UINT = (1n << 256n) - 1n;

export interface EvmTxRequest {
  chainId: number;
  to: string;
  data: string;
  value: string;
}

export function checkEvmTx(tx: EvmTxRequest, kind: "swap" | "approve", ownerAddress: string): string[] {
  const problems: string[] = [];
  const routers = EVM_ROUTERS[tx.chainId];
  if (!routers) return [`cadena no permitida (${tx.chainId})`];
  const data = tx.data.toLowerCase();
  const owner = ownerAddress.toLowerCase().replace(/^0x/, "");
  if (kind === "approve") {
    if (!data.startsWith(APPROVE) || data.length !== 2 + 8 + 128) return ["no es un approve estándar"];
    if (BigInt(tx.value || "0") !== 0n) problems.push("un approve no envía nativo");
    const spender = "0x" + data.slice(10 + 24, 10 + 64);
    const amount = BigInt("0x" + data.slice(10 + 64));
    if (!routers.has(spender)) problems.push(`approve a un contrato no permitido (${spender})`);
    if (amount === MAX_UINT) problems.push("approve ilimitado: solo se aprueba la cantidad exacta");
    return problems;
  }
  if (!routers.has(tx.to.toLowerCase())) problems.push(`contrato no permitido (${tx.to})`);
  // El router debe devolver lo comprado a la propia cartera: la dirección aparece como destinatario.
  if (!data.includes(owner)) problems.push("el destinatario del swap no es la cartera de la IA");
  return problems;
}

// ─── Límites de la misión ───────────────────────────────────────────────────

export interface IntentCheck {
  side: "buy" | "sell";
  usd: number;
  maxTradeUsd: number;
  maxLossPct: number;
  initialUsd: number;
  currentUsd: number;
}

/** Vender a estables siempre se permite (reduce el riesgo); comprar, dentro de los límites. */
export function checkLimits(c: IntentCheck): string[] {
  if (c.side === "sell") return [];
  const problems: string[] = [];
  if (c.usd > c.maxTradeUsd * 1.02) problems.push(`la operación (${c.usd.toFixed(2)} $) supera el máximo por operación (${c.maxTradeUsd.toFixed(2)} $)`);
  const floor = c.initialUsd * (1 - c.maxLossPct / 100);
  if (c.currentUsd < floor) {
    problems.push(`la cartera (${c.currentUsd.toFixed(2)} $) está por debajo de la pérdida máxima de la misión (${floor.toFixed(2)} $): solo se puede vender a estables`);
  }
  return problems;
}
