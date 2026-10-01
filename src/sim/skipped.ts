// Lo que el agente vio en sus escaneos y no compró, y cómo le fue hasta el final de la misión. Sin esto, el tiempo que
// pasa mirando sin comprar no deja ningún dato: no sabe si sus filtros descartaron lo bueno o lo malo.
import { db, now } from "../db.js";
import type { ChainId } from "./types.js";
import { getChain } from "./venues/index.js";

/** Cuántos candidatos de cada escaneo se guardan (los primeros, que son los que mira). */
const SEEN_PER_SCAN = 10;

/** Guarda los primeros candidatos de un escaneo con su precio de ese momento (solo la primera vez que aparece cada uno). */
export async function recordSeen(missionId: number | null, chain: ChainId, candidates: Array<Record<string, unknown>>) {
  if (missionId === null) return;
  const top = candidates
    .slice(0, SEEN_PER_SCAN)
    .map((c) => ({ c, asset: String(c.mint ?? c.token ?? c.address ?? "") }))
    .filter((x) => x.asset);
  const fresh = top.filter(({ asset }) => !db.prepare("SELECT 1 FROM scan_seen WHERE mission_id = ? AND chain = ? AND asset = ?").get(missionId, chain, asset));
  if (!fresh.length) return;
  const prices = await getChain(chain)
    .priceUsd(fresh.map((x) => x.asset))
    .catch(() => ({}) as Record<string, number>);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO scan_seen (mission_id, ts, chain, asset, symbol, price_usd, features) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const { c, asset } of fresh) {
    const price = prices[asset];
    if (!price) continue;
    const features = {
      liquidityUsd: c.liquidityUsd,
      ageMinutes: c.ageMinutes,
      priceChange5mPct: c.priceChange5mPct,
      priceChange1hPct: c.priceChange1hPct,
      netBuyers5m: c.netBuyers5m,
      mcapUsd: c.mcapUsd,
    };
    insert.run(missionId, now(), chain, asset, typeof c.symbol === "string" ? c.symbol : null, price, JSON.stringify(features));
  }
}

/** Al acabar la misión: el precio de cada candidato visto, para medir cuánto se movió desde que lo vio. */
export async function measureSkipped(missionId: number) {
  const rows = db.prepare("SELECT id, chain, asset FROM scan_seen WHERE mission_id = ? AND end_price_usd IS NULL").all(missionId) as Array<{
    id: number;
    chain: ChainId;
    asset: string;
  }>;
  const update = db.prepare("UPDATE scan_seen SET end_price_usd = ?, measured_at = ? WHERE id = ?");
  for (const chain of new Set(rows.map((r) => r.chain))) {
    const list = rows.filter((r) => r.chain === chain);
    const prices = await getChain(chain)
      .priceUsd(list.map((r) => r.asset))
      .catch(() => ({}) as Record<string, number>);
    for (const r of list) if (prices[r.asset]) update.run(prices[r.asset], now(), r.id);
  }
}

/**
 * Para el revisor: los candidatos que vio y no compró, con cuánto se movieron desde que los vio hasta el final de la
 * misión, y un resumen. Si los que descartó subieron más que los que compró, sus filtros dejan fuera lo bueno.
 */
export function skippedCandidates(missionId: number) {
  const startedAt = (db.prepare("SELECT COALESCE(started_at, created_at) AS t FROM missions WHERE id = ?").get(missionId) as { t: string } | undefined)?.t;
  const bought = new Set(
    (db.prepare("SELECT venue, asset FROM positions WHERE mission_id = ?").all(missionId) as Array<{ venue: string; asset: string }>).map(
      (p) => `${p.venue}:${p.asset.toLowerCase()}`,
    ),
  );
  const rows = (
    db.prepare("SELECT ts, chain, asset, symbol, price_usd, end_price_usd, features FROM scan_seen WHERE mission_id = ? AND end_price_usd IS NOT NULL").all(missionId) as Array<{
      ts: string;
      chain: string;
      asset: string;
      symbol: string | null;
      price_usd: number;
      end_price_usd: number;
      features: string | null;
    }>
  ).filter((r) => !bought.has(`${r.chain}:${r.asset.toLowerCase()}`));
  if (!rows.length) return null;
  const list = rows
    .map((r) => ({
      symbol: r.symbol ?? r.asset.slice(0, 6),
      chain: r.chain,
      ...(startedAt ? { seenAtMinute: Math.round((new Date(r.ts).getTime() - new Date(startedAt).getTime()) / 60_000) } : {}),
      changeUntilEndPct: Number((((r.end_price_usd - r.price_usd) / r.price_usd) * 100).toFixed(1)),
      ...(JSON.parse(r.features ?? "{}") as Record<string, unknown>),
    }))
    .sort((a, b) => Math.abs(b.changeUntilEndPct) - Math.abs(a.changeUntilEndPct));
  const changes = list.map((x) => x.changeUntilEndPct).sort((a, b) => a - b);
  return {
    seenNotBought: list.length,
    medianChangePct: changes[Math.floor(changes.length / 2)],
    upMoreThan20Pct: changes.filter((x) => x >= 20).length,
    downMoreThan20Pct: changes.filter((x) => x <= -20).length,
    note: "Candidatos que viste en tus escaneos y no compraste: cuánto se movió su precio desde que los viste hasta el final de la misión (sin costes de entrar y salir). Sirve para saber si tus filtros descartaron lo que luego subió o lo que luego cayó.",
    biggestMoves: list.slice(0, 15),
  };
}
