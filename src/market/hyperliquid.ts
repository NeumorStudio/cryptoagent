// Datos públicos de Hyperliquid (perpetuos), sin clave: precio mark, funding horario y apalancamiento máximo.
import { fetchJson } from "./http.js";

export interface PerpMarket {
  coin: string;
  maxLeverage: number;
  markPx: number;
  /** Funding por hora (fracción del nocional). Positivo: los largos pagan a los cortos. */
  fundingHourly: number;
}

export async function perpMarkets(): Promise<Map<string, PerpMarket>> {
  const [meta, ctxs] = await fetchJson<[{ universe: Array<{ name: string; maxLeverage: number; isDelisted?: boolean }> }, Array<{ markPx: string; funding: string }>]>(
    "https://api.hyperliquid.xyz/info",
    { method: "POST", body: { type: "metaAndAssetCtxs" }, ttlMs: 5_000 },
  );
  const out = new Map<string, PerpMarket>();
  meta.universe.forEach((u, i) => {
    const c = ctxs[i];
    if (!c || u.isDelisted) return;
    out.set(u.name.toUpperCase(), { coin: u.name.toUpperCase(), maxLeverage: u.maxLeverage, markPx: Number(c.markPx), fundingHourly: Number(c.funding) });
  });
  return out;
}

export async function perpMarket(coin: string): Promise<PerpMarket> {
  const m = (await perpMarkets()).get(coin.toUpperCase());
  if (!m) throw new Error(`Hyperliquid no tiene un perpetuo de ${coin}`);
  return m;
}
