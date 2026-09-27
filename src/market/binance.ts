// Datos reales de Binance spot (API pública, sin API key).
// Las órdenes de mercado se simulan recorriendo el order book real nivel a nivel,
// así el precio medio y el slippage son los que habría en ese instante.
import { fetchJson } from "./http.js";

const BASE = "https://api.binance.com/api/v3";

export interface SymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  stepSize: number;
  minNotional: number;
}

const symbolCache = new Map<string, SymbolInfo>();

export async function getSymbolInfo(symbol: string): Promise<SymbolInfo> {
  const key = symbol.toUpperCase();
  const cached = symbolCache.get(key);
  if (cached) return cached;
  const info = await fetchJson<{ symbols: Array<Record<string, any>> }>(`${BASE}/exchangeInfo?symbol=${key}`);
  const s = info.symbols[0];
  if (!s || s.status !== "TRADING") throw new Error(`El par ${key} no existe o no está en trading en Binance`);
  const filters: Array<Record<string, string>> = s.filters;
  const lot = filters.find((f) => f.filterType === "LOT_SIZE");
  const notional = filters.find((f) => f.filterType === "NOTIONAL" || f.filterType === "MIN_NOTIONAL");
  const result: SymbolInfo = {
    symbol: key,
    baseAsset: s.baseAsset,
    quoteAsset: s.quoteAsset,
    stepSize: Number(lot?.stepSize ?? "0"),
    minNotional: Number(notional?.minNotional ?? "0"),
  };
  symbolCache.set(key, result);
  return result;
}

export type Level = [number, number]; // [precio, cantidad base]

export async function getOrderBook(symbol: string): Promise<{ bids: Level[]; asks: Level[] }> {
  const raw = await fetchJson<{ bids: [string, string][]; asks: [string, string][] }>(
    `${BASE}/depth?symbol=${symbol.toUpperCase()}&limit=5000`,
    15_000,
    2_000, // determina el precio de ejecución: caché muy corta
  );
  const parse = (levels: [string, string][]): Level[] => levels.map(([p, q]) => [Number(p), Number(q)]);
  return { bids: parse(raw.bids), asks: parse(raw.asks) };
}

export interface MarketFill {
  baseQty: number;
  quoteQty: number;
  avgPrice: number;
  bestPrice: number;
  slippagePct: number;
  levelsConsumed: number;
}

/**
 * Simula una orden de mercado contra el libro real.
 * BUY: se indica cuánto quote gastar. SELL: cuánta cantidad base vender.
 */
export function walkBook(levels: Level[], side: "BUY" | "SELL", amount: number): MarketFill {
  let remaining = amount;
  let baseQty = 0;
  let quoteQty = 0;
  let levelsConsumed = 0;
  for (const [price, qty] of levels) {
    if (remaining <= 0) break;
    levelsConsumed++;
    if (side === "BUY") {
      const spend = Math.min(remaining, price * qty);
      baseQty += spend / price;
      quoteQty += spend;
      remaining -= spend;
    } else {
      const sell = Math.min(remaining, qty);
      baseQty += sell;
      quoteQty += sell * price;
      remaining -= sell;
    }
  }
  if (remaining > 1e-12) throw new Error("No hay liquidez suficiente en el libro para esa cantidad");
  const bestPrice = levels[0][0];
  const avgPrice = quoteQty / baseQty;
  return {
    baseQty,
    quoteQty,
    avgPrice,
    bestPrice,
    slippagePct: (Math.abs(avgPrice - bestPrice) / bestPrice) * 100,
    levelsConsumed,
  };
}

export function roundDownToStep(qty: number, step: number): number {
  if (!step) return qty;
  const decimals = Math.max(0, Math.round(-Math.log10(step)));
  return Number((Math.floor(qty / step + 1e-9) * step).toFixed(decimals));
}

// ─── Redes de depósito y retirada ───────────────────────────────────────────

export interface NetworkInfo {
  withdrawFee: number;
  withdrawMin: number;
  depositEnable: boolean;
  withdrawEnable: boolean;
  /** Minutos estimados de llegada que publica Binance. */
  arrivalMinutes: number;
  source: "binance" | "tabla fija";
}

// Valores publicados por Binance el 27 de septiembre de 2026: se usan si su API no responde.
const STATIC_NETWORKS: Record<string, Record<string, Omit<NetworkInfo, "source">>> = {
  USDC: {
    SOL: { withdrawFee: 0.3, withdrawMin: 3, depositEnable: true, withdrawEnable: true, arrivalMinutes: 1 },
    BASE: { withdrawFee: 0.2, withdrawMin: 3, depositEnable: true, withdrawEnable: true, arrivalMinutes: 1 },
    BSC: { withdrawFee: 0, withdrawMin: 3, depositEnable: true, withdrawEnable: true, arrivalMinutes: 1 },
  },
  USDT: {
    SOL: { withdrawFee: 0.3, withdrawMin: 5, depositEnable: true, withdrawEnable: true, arrivalMinutes: 1 },
    BSC: { withdrawFee: 0.01, withdrawMin: 5, depositEnable: true, withdrawEnable: true, arrivalMinutes: 1 },
  },
  SOL: { SOL: { withdrawFee: 0.001, withdrawMin: 0.01, depositEnable: true, withdrawEnable: true, arrivalMinutes: 1 } },
  ETH: { BASE: { withdrawFee: 0.00005, withdrawMin: 0.002, depositEnable: true, withdrawEnable: true, arrivalMinutes: 1 } },
  BNB: { BSC: { withdrawFee: 0.00001, withdrawMin: 0.0005, depositEnable: true, withdrawEnable: true, arrivalMinutes: 1 } },
};

/** Comisión, mínimo y estado de una moneda en una red de Binance (API pública de su web, sin clave). */
export async function networkInfo(coin: string, network: string): Promise<NetworkInfo | undefined> {
  try {
    const res = await fetchJson<{ data: Array<{ coin: string; networkList: Array<Record<string, any>> }> }>(
      "https://www.binance.com/bapi/capital/v1/public/capital/getNetworkCoinAll",
      { ttlMs: 60 * 60_000 },
    );
    const n = res.data.find((c) => c.coin === coin)?.networkList.find((x) => x.network === network);
    if (n) {
      return {
        withdrawFee: Number(n.withdrawFee),
        withdrawMin: Number(n.withdrawMin),
        depositEnable: Boolean(n.depositEnable),
        withdrawEnable: Boolean(n.withdrawEnable),
        arrivalMinutes: Math.max(1, Number(n.estimatedArrivalTime) || 1),
        source: "binance",
      };
    }
  } catch {
    /* se usa la tabla fija */
  }
  const s = STATIC_NETWORKS[coin]?.[network];
  return s ? { ...s, source: "tabla fija" } : undefined;
}
