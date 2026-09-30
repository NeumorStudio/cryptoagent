// Herramientas de investigación que juntan varias fuentes públicas en una sola llamada y
// devuelven solo los campos útiles. Si una fuente falla, se indica y el resto sigue.
import { fetchJson } from "./http.js";

const n = (v: unknown, digits = 2) => (typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(digits)) : undefined);
const ageMinutes = (iso: string | number | undefined) =>
  iso === undefined ? undefined : Math.round((Date.now() - new Date(iso).getTime()) / 60_000);

async function attempt<T>(label: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: `${label}: ${(err as Error).message.slice(0, 160)}` };
  }
}

interface Candidate {
  mint: string;
  symbol?: string;
  name?: string;
  sources: string[];
  mcapUsd?: number;
  liquidityUsd?: number;
  /** De dónde sale liquidityUsd: Jupiter (un lado del pool, como riskCheck y la memoria) u otra fuente (los dos lados). */
  liquiditySource?: string;
  priceChange5mPct?: number;
  priceChange1hPct?: number;
  netBuyers5m?: number;
  traders5m?: number;
  ageMinutes?: number;
  pumpfunGraduated?: boolean;
  pumpfunReplies?: number;
  dexscreenerBoost?: number;
  creatorTokens?: number;
  creatorGraduated?: number;
  warning?: string;
}

/** Candidatos de Solana de varias fuentes, combinados por mint. */
export async function scanMarket(limit = 25) {
  const merged = new Map<string, Candidate>();
  // Liquidez y cambios de precio: la de Jupiter manda cuando la hay. Es la misma medida que usan riskCheck y la
  // memoria; DexScreener y GeckoTerminal suman los dos lados del pool (suele salir el doble) y miden solo un par.
  // Antes cada candidato llevaba la de la fuente que respondiera primero, y no se podían comparar entre sí.
  const jupiterFirst = new Set(["liquidityUsd", "priceChange5mPct", "priceChange1hPct"]);
  const add = (mint: string | undefined, source: string, data: Partial<Candidate>) => {
    if (!mint) return;
    const c = merged.get(mint) ?? { mint, sources: [] };
    if (!c.sources.includes(source)) c.sources.push(source);
    const replace = source.startsWith("jupiter") && !c.liquiditySource?.startsWith("jupiter");
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      const override = replace && jupiterFirst.has(k);
      if ((c as any)[k] !== undefined && !override) continue;
      (c as any)[k] = v;
      if (k === "liquidityUsd") c.liquiditySource = source;
    }
    merged.set(mint, c);
  };

  const jup = async (interval: "5m" | "1h") => {
    const list = await fetchJson<any[]>(`https://lite-api.jup.ag/tokens/v2/toptrending/${interval}?limit=50`);
    for (const t of list) {
      add(t.id, `jupiter_trending_${interval}`, {
        symbol: t.symbol,
        name: t.name,
        mcapUsd: n(t.mcap, 0),
        liquidityUsd: n(t.liquidity, 0),
        priceChange5mPct: n(t.stats5m?.priceChange),
        priceChange1hPct: n(t.stats1h?.priceChange),
        netBuyers5m: t.stats5m?.numNetBuyers,
        traders5m: t.stats5m?.numTraders,
        ageMinutes: ageMinutes(t.createdAt),
        // Historial del creador (Jupiter): cuántos tokens ha lanzado y cuántos se graduaron.
        creatorTokens: t.audit?.devMints,
        creatorGraduated: t.audit?.devMigrations,
      });
    }
    return list.length;
  };
  const pump = async () => {
    const list = await fetchJson<any[]>("https://frontend-api-v3.pump.fun/coins/currently-live?limit=40&offset=0&includeNsfw=false");
    for (const c of list) {
      add(c.mint, "pumpfun_live", {
        symbol: c.symbol,
        name: c.name,
        mcapUsd: n(c.usd_market_cap, 0),
        pumpfunGraduated: c.complete,
        pumpfunReplies: c.reply_count,
        ageMinutes: ageMinutes(c.created_timestamp),
      });
    }
    return list.length;
  };
  const boosts = async () => {
    const list = await fetchJson<any[]>("https://api.dexscreener.com/token-boosts/latest/v1");
    const sol = list.filter((b) => b.chainId === "solana");
    for (const b of sol) add(b.tokenAddress, "dexscreener_boosted", { dexscreenerBoost: b.totalAmount });
    return sol.length;
  };
  // Perfiles recién creados en DexScreener: es donde aparecen antes los tokens de minutos (lo descubrió el agente
  // en la M25, a mano con http_get). Los datos del par, de su API de tokens (hasta 30 por petición).
  const profiles = async () => {
    const list = await fetchJson<any[]>("https://api.dexscreener.com/token-profiles/latest/v1");
    const mints = [...new Set(list.filter((p) => p.chainId === "solana").map((p) => String(p.tokenAddress)))].slice(0, 30);
    if (!mints.length) return 0;
    const res = await fetchJson<{ pairs?: any[] }>(`https://api.dexscreener.com/latest/dex/tokens/${mints.join(",")}`);
    const best = new Map<string, any>();
    for (const p of res.pairs ?? []) {
      const mint = p.baseToken?.address;
      if (mints.includes(mint) && (p.liquidity?.usd ?? 0) > (best.get(mint)?.liquidity?.usd ?? -1)) best.set(mint, p);
    }
    for (const [mint, p] of best) {
      add(mint, "dexscreener_profiles", {
        symbol: p.baseToken?.symbol,
        name: p.baseToken?.name,
        mcapUsd: n(p.marketCap ?? p.fdv, 0),
        liquidityUsd: n(p.liquidity?.usd, 0),
        priceChange5mPct: n(p.priceChange?.m5),
        priceChange1hPct: n(p.priceChange?.h1),
        ageMinutes: ageMinutes(p.pairCreatedAt),
      });
    }
    return best.size;
  };
  const gecko = async () => {
    const res = await fetchJson<{ data: any[] }>("https://api.geckoterminal.com/api/v2/networks/solana/trending_pools");
    for (const p of res.data) {
      const mint = String(p.relationships?.base_token?.data?.id ?? "").replace(/^solana_/, "");
      const a = p.attributes ?? {};
      add(mint, "geckoterminal_trending", {
        name: a.name,
        liquidityUsd: n(Number(a.reserve_in_usd), 0),
        priceChange5mPct: n(Number(a.price_change_percentage?.m5)),
        priceChange1hPct: n(Number(a.price_change_percentage?.h1)),
        ageMinutes: ageMinutes(a.pool_created_at),
      });
    }
    return res.data.length;
  };

  const status = await Promise.all([
    attempt("jupiter_trending_5m", () => jup("5m")),
    attempt("jupiter_trending_1h", () => jup("1h")),
    attempt("pumpfun_live", pump),
    attempt("dexscreener_boosted", boosts),
    attempt("geckoterminal_trending", gecko),
    attempt("dexscreener_profiles", profiles),
  ]);

  const all = [...merged.values()].sort((a, b) => b.sources.length - a.sources.length || (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
  const candidates = all.slice(0, limit);
  // Los que salen en más fuentes van primero, y un token de minutos casi nunca sale en varias: los más recientes
  // que se han quedado fuera de la lista, aparte, para que se vean.
  const newest = all
    .slice(limit)
    .filter((c) => c.ageMinutes !== undefined && c.ageMinutes < 60)
    .sort((a, b) => (a.ageMinutes ?? 0) - (b.ageMinutes ?? 0))
    .slice(0, 5);
  return {
    note:
      "Candidatos combinados de varias fuentes (los que aparecen en más fuentes van primero). " +
      "Para analizar uno a fondo usa token_report con chain: solana y su mint.",
    sourcesStatus: status.map((s, i) =>
      typeof s === "number"
        ? `${["jupiter_trending_5m", "jupiter_trending_1h", "pumpfun_live", "dexscreener_boosted", "geckoterminal_trending", "dexscreener_profiles"][i]}: ${s}`
        : s.error,
    ),
    totalUnique: merged.size,
    candidates,
    ...(newest.length ? { newest } : {}),
  };
}

/** Ficha de un token de Solana: actividad, holders, auditoría, riesgos, webs y redes. */
export async function tokenReport(mint: string) {
  const [jupiter, dexscreener, rugcheck, pumpfun] = await Promise.all([
    attempt("jupiter", async () => {
      const list = await fetchJson<any[]>(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(mint)}`);
      const t = list.find((x) => x.id === mint);
      if (!t) return { error: "no encontrado en Jupiter" };
      const stats = (s: any) =>
        s && {
          priceChangePct: n(s.priceChange),
          buyVolumeUsd: n(s.buyVolume, 0),
          sellVolumeUsd: n(s.sellVolume, 0),
          buys: s.numBuys,
          sells: s.numSells,
          traders: s.numTraders,
          netBuyers: s.numNetBuyers,
          organicBuyers: s.numOrganicBuyers,
        };
      return {
        symbol: t.symbol,
        name: t.name,
        priceUsd: t.usdPrice,
        mcapUsd: n(t.mcap, 0),
        liquidityUsd: n(t.liquidity, 0),
        holders: t.holderCount,
        ageMinutes: ageMinutes(t.createdAt),
        launchpad: t.launchpad,
        graduatedAt: t.graduatedAt,
        organicScore: n(t.organicScore, 1),
        verified: t.isVerified,
        website: t.website,
        audit: t.audit,
        stats5m: stats(t.stats5m),
        stats1h: stats(t.stats1h),
        stats24h: stats(t.stats24h),
      };
    }),
    attempt("dexscreener", async () => {
      const pairs = await fetchJson<any[]>(`https://api.dexscreener.com/tokens/v1/solana/${mint}`);
      if (!pairs.length) return { error: "sin pares en DexScreener" };
      const top = pairs[0];
      return {
        pairs: pairs.length,
        mainDex: top.dexId,
        pairAgeMinutes: ageMinutes(top.pairCreatedAt),
        liquidityUsd: n(top.liquidity?.usd, 0),
        liquidityNote:
          "DexScreener suma los dos lados del pool (el token y el SOL o la estable): suele salir cerca del doble que la liquidez de Jupiter, " +
          "que es la que usan riskCheck y la memoria. Su priceChangePct es el de este par; el de Jupiter (stats5m) agrega todos los pools.",
        volumeUsd: top.volume,
        volume1hAllPairsUsd: n(pairs.reduce((s: number, p: any) => s + Number(p.volume?.h1 ?? 0), 0), 0),
        txns: { m5: top.txns?.m5, h1: top.txns?.h1 },
        priceChangePct: top.priceChange,
        websites: top.info?.websites?.map((w: any) => w.url),
        socials: top.info?.socials?.map((s: any) => `${s.type}: ${s.url}`),
        boosts: top.boosts?.active,
        url: top.url,
      };
    }),
    attempt("rugcheck", async () => {
      const r = await fetchJson<any>(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`);
      return {
        scoreNormalised: r.score_normalised,
        risks: (r.risks ?? []).map((x: any) => `${x.level}: ${x.name}${x.value ? ` (${x.value})` : ""}`),
      };
    }),
    mint.endsWith("pump")
      ? attempt("pumpfun", async () => {
          const c = await fetchJson<any>(`https://frontend-api-v3.pump.fun/coins-v2/${mint}`);
          return {
            description: c.description,
            twitter: c.twitter,
            telegram: c.telegram,
            website: c.website,
            replies: c.reply_count,
            participants: c.num_participants,
            graduated: c.complete,
            mcapUsd: n(c.usd_market_cap, 0),
            athMcapUsd: n(c.ath_market_cap, 0),
            securityVerdict: c.security_verdict,
            createdMinutesAgo: ageMinutes(c.created_timestamp),
            url: `https://pump.fun/coin/${mint}`,
          };
        })
      : Promise.resolve(undefined),
  ]);
  const volumeCheck = volumeJupiterVsDex(jupiter as any, dexscreener as any);
  return { mint, jupiter, dexscreener, ...(volumeCheck ? { volumeCheck } : {}), rugcheck, ...(pumpfun ? { pumpfun } : {}) };
}

/**
 * Volumen de la última hora según Jupiter y según DexScreener (todos sus pares), y su cociente. Jupiter cuenta
 * todas las rutas; DexScreener, los pools que conoce. Solo el dato: qué significa una gran diferencia lo aprende
 * el agente (lo pidió el revisor en la M6 de la v0.35.3: 162k en Jupiter frente a 10k en DexScreener).
 */
export function volumeJupiterVsDex(
  jupiter: { stats1h?: { buyVolumeUsd?: number; sellVolumeUsd?: number } } | undefined,
  dexscreener: { volume1hAllPairsUsd?: number } | undefined,
) {
  const jup = (jupiter?.stats1h?.buyVolumeUsd ?? 0) + (jupiter?.stats1h?.sellVolumeUsd ?? 0);
  const dex = dexscreener?.volume1hAllPairsUsd ?? 0;
  if (!(jup > 0) || !(dex > 0)) return undefined;
  return { jupiter1hUsd: Math.round(jup), dexscreener1hUsd: Math.round(dex), volume1hJupiterVsDexRatio: Number((jup / dex).toFixed(1)) };
}
