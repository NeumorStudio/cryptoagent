// Datos de pump.fun que no están en las APIs generales: los top holders con sus flags de riesgo
// (dev, sniper, bundler). Fuente: advanced-api-v2.pump.fun (la misma que usa la web; sin clave).
// Un holder marcado como sniper compró en el lanzamiento y uno como bundler agrupó la compra: ambos
// son señal de que puede ser una granja coordinada que va a descargar sobre los compradores tardíos.
import { fetchJson } from "./http.js";

const n = (v: unknown, d = 2) => (typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(d)) : undefined);

const short = (s: string) => (s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s);

interface PumpHolder {
  address: string;
  amount: number;
  isDev?: boolean;
  isSniper?: boolean;
  isBundler?: boolean;
  enteredAt?: number | null;
  fundingSource?: string | null;
}

/** Top holders de un token de pump.fun, con resumen de riesgos (dev, snipers, bundlers). */
export async function pumpHolders(mint: string): Promise<Record<string, unknown>> {
  const res = await fetchJson<{ topHolders?: PumpHolder[] }>(
    `https://advanced-api-v2.pump.fun/coins/top-holders/${mint}`,
  );
  const holders = res.topHolders ?? [];
  return {
    note:
      "Top holders del token según pump.fun. isDev = el creador aún conserva; isSniper = compró en el lanzamiento; " +
      "isBundler = agrupó la compra. Sniper y bundler son señal de que puede ser una granja coordinada.",
    summary: {
      holders: holders.length,
      devStillHolding: holders.some((h) => h.isDev),
      snipers: holders.filter((h) => h.isSniper).length,
      bundlers: holders.filter((h) => h.isBundler).length,
    },
    holders: holders.map((h) => ({
      address: short(h.address),
      fullAddress: h.address,
      amount: n(h.amount, 0),
      flags: [h.isDev ? "dev" : null, h.isSniper ? "sniper" : null, h.isBundler ? "bundler" : null].filter(Boolean).join(" · ") || "—",
      ...(h.fundingSource ? { funding: h.fundingSource } : {}),
    })),
  };
}

/** Feed social y actividad de pump.fun. */
export async function pumpFeed(): Promise<Record<string, unknown>> {
  try {
    const list = await fetchJson<any[]>("https://frontend-api-v3.pump.fun/coins/currently-live?limit=15&offset=0&includeNsfw=false").catch(() => []);
    return {
      note: "Feed social y actividad en pump.fun en directo.",
      liveCoins: list.map((c) => ({
        mint: c.mint,
        symbol: c.symbol,
        name: c.name,
        marketCapUsd: n(c.usd_market_cap, 0),
        replies: c.reply_count,
      })),
    };
  } catch (err) {
    return { error: `No se pudo obtener el feed de pump.fun: ${(err as Error).message}` };
  }
}

