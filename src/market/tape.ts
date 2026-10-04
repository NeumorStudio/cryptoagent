// Cinta de transacciones de un token: últimas compras y ventas, con lado, tamaño en USD, monedero y
// momento. Es lo que le falta al agente para "ver las transacciones" de un token al entrar o al seguirlo.
// Fuente: GeckoTerminal (público, sin clave), el mismo servicio del que ya se sacan las velas de los
// contrafactuales. Para un token que sigue en la curva de pump.fun (sin pool DEX) no hay cinta por esta
// vía: se avisa en lugar de fallar.
import { fetchJson } from "./http.js";

const n = (v: unknown, d = 2) => (typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(d)) : undefined);

/** Red de GeckoTerminal para cada cadena del simulador. */
const NETWORK: Record<string, string> = { solana: "solana", base: "base", bsc: "bsc" };

export interface TapeTrade {
  /** Hora del bloque (ISO). */
  timeIso?: string;
  /** Compra o venta del token que se consulta. */
  side: "buy" | "sell";
  /** Volumen en USD de la operación. */
  usd?: number;
  /** Monedero que inició la transacción. */
  wallet?: string;
  /** Hash o firma de la transacción. */
  tx?: string;
}

const short = (s: string) => (s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s);

/** Últimas operaciones del pool de un token, con el lado relativo a ese token. */
async function poolTrades(net: string, pool: string, token: string): Promise<TapeTrade[]> {
  const res = await fetchJson<{ data?: Array<{ attributes?: Record<string, unknown> }> }>(
    `https://api.geckoterminal.com/api/v2/networks/${net}/pools/${pool}/trades`,
  );
  const tokenKey = token.toLowerCase();
  return (res.data ?? []).map((t) => {
    const a = t.attributes ?? {};
    const from = String(a.from_token_address ?? "").toLowerCase();
    const to = String(a.to_token_address ?? "").toLowerCase();
    // El lado depende de si nuestro token sale (venta) o entra (compra) en la operación; `kind` es relativo
    // al token base del pool, así que comparar direcciones es lo inequívoco.
    const side: "buy" | "sell" = to === tokenKey ? "buy" : from === tokenKey ? "sell" : a.kind === "sell" ? "sell" : "buy";
    return {
      timeIso: typeof a.block_timestamp === "string" ? a.block_timestamp : undefined,
      side,
      usd: n(Number(a.volume_in_usd)),
      wallet: typeof a.tx_from_address === "string" ? a.tx_from_address : undefined,
      tx: typeof a.tx_hash === "string" ? a.tx_hash : undefined,
    };
  });
}

/**
 * Cinta de un token: últimas operaciones y un resumen del flujo de los últimos 5 minutos. Devuelve
 * `{ unavailable }` si no hay pool en GeckoTerminal (p. ej. un token aún en la curva de pump.fun).
 */
export async function tradeTape(chain: string, token: string, limit = 25): Promise<Record<string, unknown>> {
  const net = NETWORK[chain];
  if (!net) return { unavailable: `cadena sin cinta en GeckoTerminal: ${chain}` };

  // El pool con más liquidez (el primero de la lista puede ser uno pequeño o manipulado).
  const pools = await fetchJson<{ data?: Array<{ attributes?: { address?: string; reserve_in_usd?: string } }> }>(
    `https://api.geckoterminal.com/api/v2/networks/${net}/tokens/${token}/pools?page=1`,
  ).catch(() => ({ data: [] as Array<{ attributes?: { address?: string; reserve_in_usd?: string } }> }));
  const pool = [...(pools.data ?? [])]
    .sort((a, b) => Number(b.attributes?.reserve_in_usd ?? 0) - Number(a.attributes?.reserve_in_usd ?? 0))[0]?.attributes
    ?.address;
  if (!pool) {
    return { unavailable: "sin pool en GeckoTerminal (aún en la curva de pump.fun o sin liquidez DEX): no hay cinta por esta vía" };
  }

  const trades = await poolTrades(net, pool, token).catch(() => [] as TapeTrade[]);
  const list = trades.slice(0, limit);
  const fiveMinAgo = Date.now() - 5 * 60_000;
  const recent = trades.filter((t) => (t.timeIso ? new Date(t.timeIso).getTime() : 0) >= fiveMinAgo);
  const buys = recent.filter((t) => t.side === "buy");
  const sells = recent.filter((t) => t.side === "sell");
  const sum = (xs: TapeTrade[]) => xs.reduce((s, t) => s + (t.usd ?? 0), 0);

  return {
    note:
      "Últimas operaciones del token (lado relativo al token). GeckoTerminal tarda unos segundos en reflejar las más recientes; " +
      "para un token aún en la curva de pump.fun no hay pool DEX y no se ve la cinta por esta vía.",
    source: "GeckoTerminal pool trades",
    ...(list.length
      ? {
          summary: {
            lastTradeAgoSec: list[0]?.timeIso ? Math.max(0, Math.round((Date.now() - new Date(list[0].timeIso).getTime()) / 1000)) : undefined,
            buys5m: buys.length,
            sells5m: sells.length,
            buysUsd5m: Number(sum(buys).toFixed(2)),
            sellsUsd5m: Number(sum(sells).toFixed(2)),
            netUsd5m: Number((sum(buys) - sum(sells)).toFixed(2)),
          },
          trades: list.map((t) => ({
            time: t.timeIso,
            side: t.side,
            usd: t.usd,
            wallet: t.wallet ? short(t.wallet) : undefined,
            fullWallet: t.wallet,
            tx: t.tx ? short(t.tx) : undefined,
          })),
        }
      : { summary: "sin operaciones recientes" }),
  };
}
