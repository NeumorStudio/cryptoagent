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
  priceChange5mPct?: number;
  priceChange1hPct?: number;
  netBuyers5m?: number;
  traders5m?: number;
  ageMinutes?: number;
  pumpfunGraduated?: boolean;
  pumpfunReplies?: number;
  dexscreenerBoost?: number;
}

/** Candidatos de Solana de varias fuentes, combinados por mint. */
export async function scanMarket(limit = 25) {
  const merged = new Map<string, Candidate>();
  const add = (mint: string | undefined, source: string, data: Partial<Candidate>) => {
    if (!mint) return;
    const c = merged.get(mint) ?? { mint, sources: [] };
    if (!c.sources.includes(source)) c.sources.push(source);
    for (const [k, v] of Object.entries(data)) if (v !== undefined && (c as any)[k] === undefined) (c as any)[k] = v;
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
  ]);

  const candidates = [...merged.values()]
    .sort((a, b) => b.sources.length - a.sources.length || (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
    .slice(0, limit);
  return {
    note:
      "Candidatos combinados de varias fuentes (los que aparecen en más fuentes van primero). " +
      "Para analizar uno a fondo usa token_report con chain: solana y su mint.",
    sourcesStatus: status.map((s, i) =>
      typeof s === "number"
        ? `${["jupiter_trending_5m", "jupiter_trending_1h", "pumpfun_live", "dexscreener_boosted", "geckoterminal_trending"][i]}: ${s}`
        : s.error,
    ),
    totalUnique: merged.size,
    candidates,
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
        volumeUsd: top.volume,
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
  return { mint, jupiter, dexscreener, rugcheck, ...(pumpfun ? { pumpfun } : {}) };
}
