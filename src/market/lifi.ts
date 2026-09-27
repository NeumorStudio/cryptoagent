// Puentes entre cadenas con Li.Fi (agregador de puentes). Sin clave tiene un cupo de 75 peticiones cada
// 2 horas por IP, compartido por todos los procesos: por eso se reserva y, si se agota, el simulador
// usa una estimación. Con LIFI_API_KEY el cupo es mayor.
import { fetchJson, takeBudget } from "./http.js";

const HOST = "li.quest";
const WINDOW_MS = 2 * 60 * 60_000;
/** Por debajo del límite real (75), para no rozarlo. */
const BUDGET = Number(process.env.LIFI_BUDGET ?? 70);

export const LIFI_CHAIN: Record<string, string> = { solana: "SOL", base: "8453", bsc: "56" };
/** Cómo llama Li.Fi a los tokens nativos. */
export const LIFI_NATIVE: Record<string, string> = {
  solana: "11111111111111111111111111111111",
  base: "0x0000000000000000000000000000000000000000",
  bsc: "0x0000000000000000000000000000000000000000",
};

export interface BridgeQuote {
  tool: string;
  toAmount: bigint;
  toAmountMin: bigint;
  durationSeconds: number;
  /** Gas en la cadena de origen, en unidades base de su token nativo. */
  gas: Array<{ amount: bigint; decimals: number; symbol: string; usd: number }>;
  fees: Array<{ name: string; usd: number }>;
  fromUsd?: number;
  toUsd?: number;
}

export class BudgetExhausted extends Error {}

export async function bridgeQuote(q: {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  fromAmount: bigint;
  fromAddress: string;
  toAddress: string;
  slippage: number;
}): Promise<BridgeQuote> {
  if (!process.env.LIFI_API_KEY && !takeBudget(HOST, BUDGET, WINDOW_MS)) {
    throw new BudgetExhausted("Se ha agotado el cupo gratuito de Li.Fi (75 consultas cada 2 horas)");
  }
  const url =
    `https://li.quest/v1/quote?fromChain=${LIFI_CHAIN[q.fromChain]}&toChain=${LIFI_CHAIN[q.toChain]}` +
    `&fromToken=${q.fromToken}&toToken=${q.toToken}&fromAmount=${q.fromAmount}` +
    `&fromAddress=${q.fromAddress}&toAddress=${q.toAddress}&slippage=${q.slippage}`;
  const res = await fetchJson<Record<string, any>>(url, {
    ttlMs: 30_000,
    timeoutMs: 30_000,
    headers: process.env.LIFI_API_KEY ? { "x-lifi-api-key": process.env.LIFI_API_KEY } : undefined,
  }).catch((err: Error) => {
    throw new Error(`Li.Fi no encuentra ruta: ${err.message.replace(/^HTTP \d+ en \S+: /, "").slice(0, 200)}`);
  });
  const e = res.estimate;
  if (!e) throw new Error(`Li.Fi no encuentra ruta: ${res.message ?? "respuesta sin estimación"}`);
  return {
    tool: String(res.tool ?? res.toolDetails?.name ?? "li.fi"),
    toAmount: BigInt(e.toAmount),
    toAmountMin: BigInt(e.toAmountMin ?? e.toAmount),
    durationSeconds: Number(e.executionDuration ?? 60),
    gas: (e.gasCosts ?? []).map((g: any) => ({ amount: BigInt(g.amount), decimals: Number(g.token?.decimals ?? 18), symbol: String(g.token?.symbol ?? "?"), usd: Number(g.amountUSD ?? 0) })),
    fees: (e.feeCosts ?? []).map((f: any) => ({ name: String(f.name), usd: Number(f.amountUSD ?? 0) })),
    fromUsd: e.fromAmountUSD ? Number(e.fromAmountUSD) : undefined,
    toUsd: e.toAmountUSD ? Number(e.toAmountUSD) : undefined,
  };
}
