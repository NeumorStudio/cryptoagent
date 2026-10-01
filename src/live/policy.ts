// Política del firmante: qué transacciones acepta firmar. Es la última barrera, independiente del
// modelo y del servidor MCP: aunque un prompt manipulado consiguiera pedir otra cosa, solo se firman
// swaps en agregadores conocidos que devuelven los fondos a la propia cartera, approves a esos routers y
// puentes de Li.Fi cuyo destinatario es la propia cartera en la otra cadena.
//
// Excepción: las rutas de TRUSTED_OFFCHAIN_ROUTES (Relay, Layerswap) registran el destinatario en su servidor, no en
// la transacción, y no se puede comprobar antes de firmar. Se admiten por decisión del usuario y se comprueban justo
// después de enviar (live/bridge.ts): si el destinatario no es la cartera, se para todo.
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

export const ata = (owner: PublicKey, mint: string, tokenProgram: string) =>
  PublicKey.findProgramAddressSync([owner.toBuffer(), new PublicKey(tokenProgram).toBuffer(), new PublicKey(mint).toBuffer()], new PublicKey(ATA_PROGRAM))[0].toBase58();

/**
 * Comprobación estructural (antes de simular). En un swap, solo programas conocidos. En un puente (Li.Fi) el
 * programa cambia según la ruta y el destinatario suele ir fuera de la cadena (puentes "por intención"), así
 * que se admite el programa del puente: la garantía la da `checkSolanaSpend` sobre la simulación.
 */
export function checkSolanaTx(tx: VersionedTransaction, ownerAddress: string, opts: { bridge?: boolean } = {}): string[] {
  const bridge = opts.bridge === true;
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
    // En un puente se admite el programa del puente de la ruta; en un swap, solo los conocidos.
    if (!program || (!SOLANA_ALLOWED_PROGRAMS.has(program) && !bridge)) {
      problems.push(`programa no permitido: ${program ?? "(desde una tabla de direcciones)"}`);
      continue;
    }
    if (program === SYSTEM_PROGRAM) {
      const type = data.length >= 4 ? new DataView(data.buffer, data.byteOffset).getUint32(0, true) : -1;
      const to = key(ix.accountKeyIndexes[1] ?? -1);
      if (type === 2 && to && ownAccounts.has(to)) continue; // envolver SOL en la propia cuenta
      if (bridge && (type === 0 || type === 2)) continue; // SOL o renta hacia el puente: lo acota la simulación
      problems.push("transferencia de SOL a una cuenta que no es de la IA");
    } else if (program === TOKEN_PROGRAM || program === TOKEN_2022) {
      const op = data[0];
      if (op === 17) continue; // SyncNative
      if (op === 9) {
        // CloseAccount: lo que queda vuelve a la propia cartera.
        if (key(ix.accountKeyIndexes[1] ?? -1) !== ownerAddress) problems.push("cierre de cuenta de token hacia otra cartera");
        continue;
      }
      // Puente: transferir al depósito del puente (lo acota la simulación) o inicializar una cuenta de token.
      if (bridge && (op === 3 || op === 12 || op === 1 || op === 16 || op === 18)) continue;
      problems.push(`instrucción de token no permitida (${op})`);
    } else if (program === ATA_PROGRAM) {
      // Crear una cuenta de token: la paga la IA y es de la IA.
      const payer = key(ix.accountKeyIndexes[0] ?? -1);
      const wallet = key(ix.accountKeyIndexes[2] ?? -1);
      // En un puente puede crearse la cuenta de depósito del puente (la renta la paga la IA).
      if (payer !== ownerAddress || (wallet !== ownerAddress && !bridge)) problems.push("crea una cuenta de token para otra cartera");
    }
    // Jupiter y Compute Budget: permitidos (Jupiter entrega la salida a la cuenta del usuario que se le indicó).
  }
  return problems;
}

/** Rutas de Li.Fi cuyo destinatario no va en la transacción (lo guarda su servidor): se comprueban después de enviar. */
export const TRUSTED_OFFCHAIN_ROUTES = new Set(["relaydepository", "layerswap"]);

/** Bytes de una dirección de Solana en hexadecimal (como aparece, en bytes32, en la calldata de un puente EVM). */
export const solanaHex = (address: string) => Buffer.from(new PublicKey(address).toBytes()).toString("hex");

/**
 * Puente desde Solana (siempre hacia una cadena EVM propia): la dirección EVM de la IA (20 bytes) tiene que aparecer
 * en la transacción, salvo en las rutas que la guardan fuera de la cadena.
 */
export function checkSolanaBridgeRecipient(messageBytes: Uint8Array, evmOwner: string, route: string | undefined): string[] {
  if (route && TRUSTED_OFFCHAIN_ROUTES.has(route)) return [];
  const needle = evmOwner.toLowerCase().replace(/^0x/, "");
  return Buffer.from(messageBytes).toString("hex").includes(needle) ? [] : ["el destinatario del puente no es la cartera de la IA"];
}

/**
 * Cerrar cuentas de token vacías (para recuperar la renta): solo instrucciones CloseAccount de cuentas de la IA hacia
 * la propia cartera. No necesita aprobación ni misión porque solo puede devolver SOL a la cartera; la simulación
 * comprueba además que no baje nada más que la comisión.
 */
export function checkSolanaCloseOnly(tx: VersionedTransaction, ownerAddress: string): string[] {
  const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
  if (keys[0] !== ownerAddress) return ["quien paga la transacción no es la cartera de la IA"];
  if (tx.message.addressTableLookups.length) return ["un cierre de cuentas no usa tablas de direcciones"];
  const problems: string[] = [];
  for (const ix of tx.message.compiledInstructions) {
    const program = keys[ix.programIdIndex];
    if (program === COMPUTE_BUDGET) continue;
    if ((program !== TOKEN_PROGRAM && program !== TOKEN_2022) || ix.data[0] !== 9 || ix.data.length !== 1) {
      problems.push("solo se admiten cierres de cuentas de token");
      continue;
    }
    const [, dest, authority] = ix.accountKeyIndexes.map((i) => keys[i]);
    if (dest !== ownerAddress || authority !== ownerAddress) problems.push("la renta tiene que volver a la cartera de la IA");
  }
  return problems;
}

/** Lo máximo que una transacción puede hacer bajar en la cartera (unidades base). */
export interface SolanaSpendBudget {
  /** SOL de la cuenta principal: lo enviado si es SOL, más comisiones, prioridad y renta de cuentas nuevas. */
  lamports: bigint;
  /** Por mint: lo que se vende o se envía. Cualquier otro token no puede bajar. */
  tokens: Record<string, bigint>;
}

export interface AccountState {
  address: string;
  lamports: bigint;
  /** Solo cuentas de token: su mint y su saldo. */
  mint?: string;
  amount?: bigint;
}

/**
 * La garantía principal en Solana: con el estado de las cuentas de la cartera antes y después (simulado),
 * lo que baja debe caber en lo aprobado. Así da igual qué programa se llame por dentro: si intentara
 * llevarse otro token o más cantidad, la simulación lo muestra y no se firma.
 */
export function checkSolanaSpend(ownerAddress: string, pre: AccountState[], post: Map<string, AccountState | null>, budget: SolanaSpendBudget): string[] {
  const problems: string[] = [];
  const spentByMint = new Map<string, bigint>();
  for (const a of pre) {
    const after = post.get(a.address);
    if (a.address === ownerAddress) {
      const spent = a.lamports - (after?.lamports ?? 0n);
      if (spent > budget.lamports) problems.push(`gastaría ${spent} lamports de SOL, más de lo aprobado (${budget.lamports})`);
      continue;
    }
    if (!a.mint || a.amount === undefined) continue;
    // Una cuenta de token que desaparece ha tenido que quedarse a cero (no se puede cerrar con saldo).
    const spent = a.amount - (after?.amount ?? 0n);
    if (spent > 0n) spentByMint.set(a.mint, (spentByMint.get(a.mint) ?? 0n) + spent);
  }
  for (const [mint, spent] of spentByMint) {
    const allowed = budget.tokens[mint] ?? 0n;
    if (spent > allowed) problems.push(`sacaría ${spent} unidades del token ${mint}, más de lo aprobado (${allowed})`);
  }
  return problems;
}

/**
 * Swap en Solana: lo comprado tiene que llegar a la cartera. Con el estado simulado, las cuentas de la IA de ese token
 * (o su SOL, si se compra SOL) suben al menos lo mínimo de la cotización. En SOL, la subida neta descuenta comisiones
 * y renta: se compara sumándole lo que se permite gastar en eso.
 */
export function checkSolanaReceive(
  ownerAddress: string,
  pre: AccountState[],
  post: Map<string, AccountState | null>,
  expect: { mint: string; min: bigint },
  feeAllowance: bigint,
): string[] {
  let received = 0n;
  for (const a of pre) {
    const after = post.get(a.address);
    if (a.address === ownerAddress) {
      if (expect.mint === WSOL_MINT) received += (after?.lamports ?? 0n) - a.lamports + feeAllowance;
      continue;
    }
    if (a.mint === expect.mint || (after?.mint === expect.mint && a.amount === undefined)) received += (after?.amount ?? 0n) - (a.amount ?? 0n);
  }
  return received >= expect.min ? [] : [`lo comprado no llega a la cartera de la IA (llegarían ${received} unidades de ${expect.mint}, mínimo ${expect.min})`];
}

/** Lee una cuenta de token SPL (mint en los bytes 0-32, saldo en 64-72). */
export function parseTokenAccount(data: Uint8Array): { mint: string; amount: bigint } | null {
  if (data.length < 72) return null;
  return { mint: new PublicKey(data.slice(0, 32)).toBase58(), amount: new DataView(data.buffer, data.byteOffset).getBigUint64(64, true) };
}

// ─── EVM ────────────────────────────────────────────────────────────────────

/** Routers permitidos por cadena (KyberSwap MetaAggregationRouterV2, la misma dirección en todas). */
export const EVM_ROUTERS: Record<number, Set<string>> = {
  8453: new Set(["0x6131b5fae19ea4f9d964eac0408e4408b66337b5"]),
  56: new Set(["0x6131b5fae19ea4f9d964eac0408e4408b66337b5"]),
};
/** Contrato de Li.Fi (LiFiDiamond), la misma dirección en Base y BNB Chain. Todos sus puentes pasan por él. */
export const LIFI_DIAMOND = "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae";
const APPROVE = "0x095ea7b3";
const MAX_UINT = (1n << 256n) - 1n;

export interface EvmTxRequest {
  chainId: number;
  to: string;
  data: string;
  value: string;
}

export interface EvmTxLimits {
  /** Nativo máximo que puede llevar la transacción: lo que se vende o se envía si es nativo (más la comisión del puente). */
  maxValue: bigint;
  /** Si el destino es una cadena EVM, el destinatario (la misma dirección) debe aparecer en la calldata. */
  destEvm?: boolean;
  /** Puente hacia Solana: la dirección de la IA en Solana, que debe aparecer (bytes32) en la calldata. */
  destSolana?: string;
  /** Nombre de la ruta en Li.Fi (va en la calldata): las de TRUSTED_OFFCHAIN_ROUTES no llevan el destinatario. */
  route?: string;
}

export function checkEvmTx(tx: EvmTxRequest, kind: "swap" | "approve" | "bridge", ownerAddress: string, limits?: EvmTxLimits): string[] {
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
    if (!routers.has(spender) && spender !== LIFI_DIAMOND) problems.push(`approve a un contrato no permitido (${spender})`);
    if (amount === MAX_UINT) problems.push("approve ilimitado: solo se aprueba la cantidad exacta");
    return problems;
  }
  if (kind === "bridge") {
    if (!limits) return ["faltan los límites del puente"];
    if (tx.to.toLowerCase() !== LIFI_DIAMOND) problems.push(`un puente solo puede ir al contrato de Li.Fi (va a ${tx.to})`);
    if (BigInt(tx.value || "0") > limits.maxValue) problems.push(`el puente envía más nativo (${BigInt(tx.value || "0")}) del aprobado (${limits.maxValue})`);
    const trusted = limits.route !== undefined && TRUSTED_OFFCHAIN_ROUTES.has(limits.route) && data.includes(Buffer.from(limits.route).toString("hex"));
    if (limits.destSolana) {
      if (!trusted && !data.includes(solanaHex(limits.destSolana))) problems.push("el destinatario del puente no es la cartera de la IA en Solana");
    } else if (!data.includes(owner)) problems.push("el destinatario del puente no es la cartera de la IA");
    return problems;
  }
  if (!routers.has(tx.to.toLowerCase())) problems.push(`contrato no permitido (${tx.to})`);
  // El router debe devolver lo comprado a la propia cartera: la dirección aparece como destinatario.
  if (!data.includes(owner)) problems.push("el destinatario del swap no es la cartera de la IA");
  // El nativo que lleva el swap no puede superar lo que se vende (si se vende el nativo).
  if (!limits) problems.push("faltan los límites del swap");
  else if (BigInt(tx.value || "0") > limits.maxValue) problems.push(`el swap envía más nativo (${BigInt(tx.value || "0")}) del aprobado (${limits.maxValue})`);
  return problems;
}

// ─── Límites de la misión ───────────────────────────────────────────────────

export interface IntentCheck {
  /** move: mover estables o el nativo entre las propias cadenas (puente). */
  side: "buy" | "sell" | "move";
  usd: number;
  maxTradeUsd: number;
  maxLossPct: number;
  initialUsd: number;
  currentUsd: number;
}

/**
 * Vender a estables siempre se permite (reduce el riesgo), y mover estables o el nativo entre las
 * propias cadenas también (no cambia el riesgo). Comprar, dentro de los límites.
 */
export function checkLimits(c: IntentCheck): string[] {
  if (c.side === "sell" || c.side === "move") return [];
  const problems: string[] = [];
  if (c.usd > c.maxTradeUsd * 1.02) problems.push(`la operación (${c.usd.toFixed(2)} $) supera el máximo por operación (${c.maxTradeUsd.toFixed(2)} $)`);
  const floor = c.initialUsd * (1 - c.maxLossPct / 100);
  if (c.currentUsd < floor) {
    problems.push(`la cartera (${c.currentUsd.toFixed(2)} $) está por debajo de la pérdida máxima de la misión (${floor.toFixed(2)} $): solo se puede vender (a estables o al nativo)`);
  }
  return problems;
}
