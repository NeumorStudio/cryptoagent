// Lado del servidor MCP: encontrar el firmante (o arrancarlo) y consultarlo. El MCP nunca ve la clave.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { asset } from "../paths.js";
import type { WalletPublic } from "./keystore.js";
import { codeBuild, signerInfoFile, type SignerInfo } from "./paths.js";
import { db } from "../db.js";
import { EVM_CHAINS, requireBlock, type EvmChainId } from "../market/evm.js";

export interface SignerStatus {
  exists: boolean;
  unlocked: boolean;
  stopped: boolean;
  wallet: WalletPublic | null;
  pid: number;
}

function readInfo(): SignerInfo | null {
  try {
    return existsSync(signerInfoFile()) ? (JSON.parse(readFileSync(signerInfoFile(), "utf8")) as SignerInfo) : null;
  } catch {
    return null;
  }
}

export const walletUrl = (info: SignerInfo) => `http://127.0.0.1:${info.port}/wallet`;

async function api<T>(info: SignerInfo, path: string, init: RequestInit = {}, timeoutMs = 5_000): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${info.port}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${info.token}`, "content-type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

/** Estado del firmante si está en marcha; null si no. */
export async function signerStatus(): Promise<{ info: SignerInfo; status: SignerStatus } | null> {
  const info = readInfo();
  if (!info) return null;
  try {
    return { info, status: await api<SignerStatus>(info, "/api/status") };
  } catch {
    return null;
  }
}

async function runningSigner() {
  const s = await signerStatus();
  if (!s) throw new Error("El firmante de la cartera no está en marcha: pide al usuario que la abra y desbloquee con /cryptoagent:cartera");
  return s.info;
}

/**
 * Pide permiso para una operación. En modo manual espera (hasta ~90 s) a que el usuario la apruebe en
 * la página de la cartera; en autónomo, solo comprueba los límites. Devuelve un ticket para firmar.
 */
export async function requestIntent(intent: { missionId: number; chain: string; side: "buy" | "sell" | "move"; usd: number; summary: string }): Promise<string> {
  const info = await runningSigner();
  const r = await api<{ ticket: string }>(info, "/api/intent", { method: "POST", body: JSON.stringify(intent) }, 100_000);
  return r.ticket;
}

export interface SignResult {
  hash: string;
  ok: boolean;
  error?: string;
  block?: string;
}

/** Para todo en el firmante (como el botón de la página): no firma nada más hasta que el usuario desbloquee. */
export async function stopSigner(): Promise<void> {
  const info = await runningSigner();
  await api(info, "/api/stop", { method: "POST", body: "{}" });
}

/** Firma y envía una transacción ya aprobada (el firmante la valida con su política y la simula antes). */
export async function signTx(body: {
  /** Aprobación de la operación (no hace falta para "close": solo cierra cuentas propias y devuelve la renta). */
  ticket?: string;
  chain: string;
  kind: "swap" | "approve" | "bridge" | "close";
  usd: number;
  solanaTx?: string;
  /** Solana: lo máximo que puede bajar en la cartera (unidades base, como texto). */
  budget?: { lamports: string; tokens: Record<string, string> };
  evmTx?: { chainId: number; to: string; data: string; value: string };
  /** EVM: nativo máximo de la transacción, si el destino (puente) es EVM o Solana y la ruta de Li.Fi. */
  evmLimits?: { maxValue: string; destEvm?: boolean; destSolana?: boolean; route?: string };
  /** Swap en Solana: el token comprado y lo mínimo que debe llegar a la cartera (unidades base, como texto). */
  expectOut?: { mint: string; min: string };
  /** Puente desde Solana: la ruta de Li.Fi. */
  route?: string;
}): Promise<SignResult> {
  const info = await runningSigner();
  const res = await api<SignResult>(info, "/api/sign", { method: "POST", body: JSON.stringify(body) }, 180_000);
  // Desde aquí, las lecturas frescas de esa cadena no aceptan nodos que aún no tengan este bloque.
  const chainId = body.chain as EvmChainId;
  if (res.block && chainId in EVM_CHAINS) requireBlock(chainId, BigInt(res.block));
  return res;
}

const signerEntry = () => asset("signer.mjs", "src/live/signer/main.ts");

/**
 * El firmante es un proceso aparte que sobrevive a las actualizaciones del plugin: tras actualizar sigue con el código
 * viejo hasta que se reinicia (en la M22 seguía el de la v0.40 y no tenía los arreglos de la v0.41). Devuelve true si
 * el que está en marcha es de otra versión que la instalada.
 */
export function signerOutdated(info: SignerInfo): boolean {
  const current = codeBuild(signerEntry());
  return current !== undefined && info.build !== current;
}

/** Se puede reiniciar sin perder nada: sin misión real en marcha ni operaciones esperando aprobación. */
function safeToRestart(status: SignerStatus & { pendingApprovals?: number }): boolean {
  const live = db.prepare("SELECT 1 FROM missions WHERE mode = 'live' AND status IN ('active', 'closing') LIMIT 1").get();
  return !live && !status.pendingApprovals;
}

/**
 * Arranca el firmante como proceso independiente (sobrevive a esta sesión) si no está ya en marcha. Si el que está en
 * marcha es de otra versión y se puede, lo reinicia (habrá que volver a desbloquear la cartera).
 */
export async function ensureSigner(): Promise<{ info: SignerInfo; status: SignerStatus; started: boolean; restarted?: boolean; outdated?: boolean }> {
  const running = await signerStatus();
  let restarted = false;
  if (running) {
    if (!signerOutdated(running.info)) return { ...running, started: false };
    if (!safeToRestart(running.status)) return { ...running, started: false, outdated: true };
    try {
      process.kill(running.info.pid);
    } catch {
      // ya no estaba
    }
    for (let i = 0; i < 25 && (await signerStatus()); i++) await new Promise((r) => setTimeout(r, 200));
    restarted = true;
  }
  const entry = signerEntry();
  const args = entry.endsWith(".ts") ? ["--import", "tsx", entry] : [entry];
  const child = spawn(process.execPath, args, { detached: true, stdio: "ignore", windowsHide: true, env: process.env });
  child.unref();
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const s = await signerStatus();
    if (s && s.status.pid === child.pid) return { ...s, started: true, restarted };
  }
  throw new Error("El firmante no ha arrancado");
}
