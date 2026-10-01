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

/**
 * Cómo elegir la ruta. Por defecto, la que más da (lo que elige Li.Fi); con "fastest", la más rápida. Las rutas de
 * Mayan MCTP se excluyen siempre: en la primera misión real (M21) Mayan Fast MCTP falló dos veces de SOL a ETH en Base
 * (devolvió USDC en destino, sin gas) y cobró ~0,0033 SOL de más por puente; en su explorador, 44 de 47 órdenes así
 * acabaron igual ese día. El agente puede excluir otras con avoidBridges.
 */
export interface RouteOptions {
  route?: "best_amount" | "fastest";
  avoidBridges?: string[];
  /**
   * Solo esta ruta (la que dio quote_bridge). Cotizar y ejecutar son dos peticiones a Li.Fi y entre una y otra puede
   * elegir otra: en la M22 cotizó Polymer (~18 min) y ejecutó lifiIntents (1 min).
   */
  bridge?: string;
}
export const ALWAYS_AVOIDED_BRIDGES = ["mayanFastMCTP", "mayanMCTP"];
const routeQuery = (o: RouteOptions = {}) => {
  if (o.bridge && ALWAYS_AVOIDED_BRIDGES.includes(o.bridge)) throw new Error(`La ruta ${o.bridge} está excluida siempre (falló en la primera misión real)`);
  return (
    (o.bridge ? `&allowBridges=${encodeURIComponent(o.bridge)}` : `&denyBridges=${[...new Set([...ALWAYS_AVOIDED_BRIDGES, ...(o.avoidBridges ?? [])])].join(",")}`) +
    (o.route === "fastest" ? "&order=FASTEST" : "")
  );
};

export async function bridgeQuote(q: {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  fromAmount: bigint;
  fromAddress: string;
  toAddress: string;
  slippage: number;
} & RouteOptions): Promise<BridgeQuote> {
  if (!process.env.LIFI_API_KEY && !takeBudget(HOST, BUDGET, WINDOW_MS)) {
    throw new BudgetExhausted("Se ha agotado el cupo gratuito de Li.Fi (75 consultas cada 2 horas)");
  }
  const url =
    `https://li.quest/v1/quote?fromChain=${LIFI_CHAIN[q.fromChain]}&toChain=${LIFI_CHAIN[q.toChain]}` +
    `&fromToken=${q.fromToken}&toToken=${q.toToken}&fromAmount=${q.fromAmount}` +
    `&fromAddress=${q.fromAddress}&toAddress=${q.toAddress}&slippage=${q.slippage}` +
    routeQuery(q);
  const res = await fetchJson<Record<string, any>>(url, {
    ttlMs: 30_000,
    timeoutMs: 30_000,
    headers: process.env.LIFI_API_KEY ? { "x-lifi-api-key": process.env.LIFI_API_KEY } : undefined,
  }).catch((err: Error) => {
    throw new Error(`Li.Fi no encuentra ruta: ${err.message.replace(/^HTTP \d+ en \S+: /, "").slice(0, 200)}`);
  });
  return parseQuote(res);
}

function parseQuote(res: Record<string, any>): BridgeQuote {
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

export interface BridgeTx extends BridgeQuote {
  /** Contrato al que hay que aprobar el token (EVM). */
  approvalAddress?: string;
  /** Direcciones que Li.Fi ha puesto en la operación: se comprueban contra las propias. */
  fromAddress: string;
  toAddress: string;
  /** EVM: {to, data, value}; Solana: {data} (transacción en base64). */
  transactionRequest: { to?: string; data: string; value?: string; chainId?: number };
}

/** Cotización con la transacción lista para firmar (dinero real). Sin caché: el precio es el del momento. */
export async function bridgeTx(q: Parameters<typeof bridgeQuote>[0]): Promise<BridgeTx> {
  if (!process.env.LIFI_API_KEY && !takeBudget(HOST, BUDGET, WINDOW_MS)) {
    throw new BudgetExhausted("Se ha agotado el cupo gratuito de Li.Fi (75 consultas cada 2 horas): inténtalo más tarde");
  }
  const url =
    `https://li.quest/v1/quote?fromChain=${LIFI_CHAIN[q.fromChain]}&toChain=${LIFI_CHAIN[q.toChain]}` +
    `&fromToken=${q.fromToken}&toToken=${q.toToken}&fromAmount=${q.fromAmount}` +
    `&fromAddress=${q.fromAddress}&toAddress=${q.toAddress}&slippage=${q.slippage}` +
    routeQuery(q);
  const res = await fetchJson<Record<string, any>>(url, {
    ttlMs: 0,
    timeoutMs: 30_000,
    headers: process.env.LIFI_API_KEY ? { "x-lifi-api-key": process.env.LIFI_API_KEY } : undefined,
  }).catch((err: Error) => {
    throw new Error(`Li.Fi no encuentra ruta: ${err.message.replace(/^HTTP \d+ en \S+: /, "").slice(0, 200)}`);
  });
  if (!res.transactionRequest?.data) throw new Error(`Li.Fi no devolvió la transacción: ${res.message ?? "sin datos"}`);
  return {
    ...parseQuote(res),
    approvalAddress: res.estimate?.approvalAddress,
    fromAddress: String(res.action?.fromAddress ?? ""),
    toAddress: String(res.action?.toAddress ?? ""),
    transactionRequest: res.transactionRequest,
  };
}

export interface BridgeStatus {
  status: "PENDING" | "DONE" | "FAILED" | "NOT_FOUND" | "INVALID";
  substatus?: string;
  /** Lo recibido en destino (unidades base), si ya ha llegado. */
  receivedAmount?: bigint;
  /**
   * El token que llegó de verdad. Puede no ser el pedido: con substatus PARTIAL (o un reembolso en destino), el
   * puente entrega otro, como Mayan Fast MCTP en la M21, que devolvió USDC en Base en lugar de ETH.
   */
  receivedToken?: { address: string; symbol: string; decimals: number };
  receivingTxHash?: string;
}

/** Estado de un puente ya enviado. */
export async function bridgeStatus(a: { txHash: string; fromChain: string; toChain: string; tool?: string }): Promise<BridgeStatus> {
  const url =
    `https://li.quest/v1/status?txHash=${a.txHash}&fromChain=${LIFI_CHAIN[a.fromChain]}&toChain=${LIFI_CHAIN[a.toChain]}` + (a.tool ? `&bridge=${a.tool}` : "");
  const res = await fetchJson<Record<string, any>>(url, {
    ttlMs: 10_000,
    headers: process.env.LIFI_API_KEY ? { "x-lifi-api-key": process.env.LIFI_API_KEY } : undefined,
  }).catch((err: Error) => ({ status: /HTTP 404/.test(err.message) ? "NOT_FOUND" : "PENDING", message: err.message }) as Record<string, any>);
  return {
    status: res.status ?? "PENDING",
    substatus: res.substatus,
    receivedAmount: res.receiving?.amount ? BigInt(res.receiving.amount) : undefined,
    receivedToken:
      res.receiving?.token?.address && typeof res.receiving.token.decimals === "number"
        ? { address: String(res.receiving.token.address), symbol: String(res.receiving.token.symbol ?? "?"), decimals: res.receiving.token.decimals }
        : undefined,
    receivingTxHash: res.receiving?.txHash,
  };
}
