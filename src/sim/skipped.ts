// Lo que el agente vio en sus escaneos y no compró, y cómo le fue hasta el final de la misión. Sin esto, el tiempo que
// pasa mirando sin comprar no deja ningún dato: no sabe si sus filtros descartaron lo bueno o lo malo.
import { db, now } from "../db.js";
import type { ChainId } from "./types.js";
import { getChain } from "./venues/index.js";

/** Cuántos candidatos de cada escaneo se guardan (los primeros, que son los que mira). */
const SEEN_PER_SCAN = 20;

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
 * Si el agente terminó la misión antes del plazo, lo descartado se vuelve a medir al llegar el plazo original: así se
 * sabe qué habría pasado si hubiera seguido (si parar antes le compensa). Lo llama la vigilancia de fondo.
 */
export async function measureAtDeadline() {
  const rows = db
    .prepare(
      `SELECT s.id, s.chain, s.asset FROM scan_seen s JOIN missions m ON m.id = s.mission_id
       WHERE s.deadline_price_usd IS NULL AND s.end_price_usd IS NOT NULL AND m.status != 'active'
         AND m.ended_at < m.deadline AND m.deadline <= ? LIMIT 60`,
    )
    .all(now()) as Array<{ id: number; chain: ChainId; asset: string }>;
  const update = db.prepare("UPDATE scan_seen SET deadline_price_usd = ? WHERE id = ?");
  for (const chain of new Set(rows.map((r) => r.chain))) {
    const list = rows.filter((r) => r.chain === chain);
    const prices = await getChain(chain)
      .priceUsd(list.map((r) => r.asset))
      .catch(() => ({}) as Record<string, number>);
    for (const r of list) update.run(prices[r.asset] ?? -1, r.id); // -1: sin precio (no se reintenta siempre)
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
    db.prepare("SELECT ts, chain, asset, symbol, price_usd, end_price_usd, deadline_price_usd, features FROM scan_seen WHERE mission_id = ? AND end_price_usd IS NOT NULL").all(missionId) as Array<{
      deadline_price_usd: number | null;
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
      // Si terminó antes: cuánto se movió además entre que paró y el plazo original.
      ...(r.deadline_price_usd && r.deadline_price_usd > 0
        ? { changeAfterYouStoppedPct: Number((((r.deadline_price_usd - r.end_price_usd) / r.end_price_usd) * 100).toFixed(1)) }
        : {}),
      ...(JSON.parse(r.features ?? "{}") as Record<string, unknown>),
    }))
    .sort((a, b) => Math.abs(b.changeUntilEndPct) - Math.abs(a.changeUntilEndPct));
  const changes = list.map((x) => x.changeUntilEndPct).sort((a, b) => a - b);
  const after = list
    .map((x) => (x as { changeAfterYouStoppedPct?: number }).changeAfterYouStoppedPct)
    .filter((x): x is number => x !== undefined)
    .sort((a, b) => a - b);
  const mission = db.prepare("SELECT ended_at, deadline FROM missions WHERE id = ?").get(missionId) as { ended_at: string | null; deadline: string } | undefined;
  const endedEarly = !!mission?.ended_at && mission.ended_at < mission.deadline;
  return {
    ...(endedEarly
      ? after.length
        ? {
            afterYouStopped: {
              measured: after.length,
              medianChangePct: after[Math.floor(after.length / 2)],
              upMoreThan20Pct: after.filter((x) => x >= 20).length,
              note: "Terminaste antes del plazo: cuánto se movieron estos candidatos entre que paraste y el plazo original.",
            },
          }
        : { afterYouStopped: `pendiente: se mide al llegar el plazo original (${mission!.deadline.slice(11, 16)} UTC)` }
      : {}),
    seenNotBought: list.length,
    medianChangePct: changes[Math.floor(changes.length / 2)],
    upMoreThan20Pct: changes.filter((x) => x >= 20).length,
    downMoreThan20Pct: changes.filter((x) => x <= -20).length,
    note: "Candidatos que viste en tus escaneos y no compraste: cuánto se movió su precio desde que los viste hasta el final de la misión (sin costes de entrar y salir). Sirve para saber si tus filtros descartaron lo que luego subió o lo que luego cayó.",
    biggestMoves: list.slice(0, 15),
  };
}
