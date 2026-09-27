// Registro objetivo de posiciones: el simulador anota cada compra y venta con sus datos reales,
// para que el agente aprenda de resultados medidos y no de su propia impresión.
import { db, now } from "../db.js";
import { fetchJson } from "../market/http.js";
import { SOL_MINT, USDC_MINT } from "../market/jupiter.js";
import type { TradeMeta } from "./types.js";

const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const CASH_MINTS = new Set([USDC_MINT, USDT_MINT]);
const CASH_TICKERS = new Set(["USDC", "USDT", "FDUSD"]);

export type { TradeMeta };

interface PositionRow {
  id: number;
  qty_open: number;
  cost_open_usd: number;
  realized_cost_usd: number;
  realized_proceeds_usd: number;
}

async function usdPrices(mints: string[]): Promise<Record<string, number>> {
  const need = mints.filter((m) => !CASH_MINTS.has(m));
  const prices: Record<string, number> = {};
  for (const m of mints) if (CASH_MINTS.has(m)) prices[m] = 1;
  if (need.length) {
    const data = await fetchJson<Record<string, { usdPrice?: number } | null>>(`https://lite-api.jup.ag/price/v3?ids=${need.join(",")}`);
    for (const m of need) if (typeof data[m]?.usdPrice === "number") prices[m] = data[m]!.usdPrice!;
  }
  return prices;
}

/** Datos del token en el momento de entrar (fuente: Jupiter y RugCheck). */
async function entryFeatures(mint: string) {
  const [jup, rug] = await Promise.allSettled([
    fetchJson<any[]>(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`, 8000),
    fetchJson<any>(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, 8000),
  ]);
  const t = jup.status === "fulfilled" ? jup.value.find((x) => x.id === mint) : undefined;
  const risks = rug.status === "fulfilled" ? (rug.value.risks ?? []) : undefined;
  const round = (v: unknown, d = 2) => (typeof v === "number" ? Number(v.toFixed(d)) : undefined);
  return {
    ageMinutes: t?.createdAt ? Math.round((Date.now() - new Date(t.createdAt).getTime()) / 60_000) : undefined,
    liquidityUsd: round(t?.liquidity, 0),
    mcapUsd: round(t?.mcap, 0),
    priceChange5mPct: round(t?.stats5m?.priceChange),
    priceChange1hPct: round(t?.stats1h?.priceChange),
    holders: t?.holderCount,
    topHoldersPct: round(t?.audit?.topHoldersPercentage, 1),
    netBuyers5m: t?.stats5m?.numNetBuyers,
    organicScore: round(t?.organicScore, 1),
    launchpad: t?.launchpad,
    rugcheckDangerRisks: risks ? risks.filter((r: any) => r.level === "danger").length : undefined,
    rugcheckWarnRisks: risks ? risks.filter((r: any) => r.level === "warn").length : undefined,
  };
}

/** Cuánto investigó el agente antes de esta entrada (solo herramientas del simulador). */
function researchSnapshot(missionId: number, mint: string) {
  const mission = db.prepare("SELECT created_at FROM missions WHERE id = ?").get(missionId) as { created_at: string };
  const lastTrade = db
    .prepare("SELECT MAX(COALESCE(closed_at, opened_at)) AS ts FROM positions WHERE mission_id = ?")
    .get(missionId) as { ts: string | null };
  const since = lastTrade.ts ?? mission.created_at;
  const count = (from: string) =>
    (db.prepare("SELECT COUNT(*) AS n FROM research_log WHERE mission_id = ? AND ts >= ?").get(missionId, from) as { n: number }).n;
  const reportedThis = db
    .prepare("SELECT COUNT(*) AS n FROM research_log WHERE mission_id = ? AND tool = 'token_report' AND target = ?")
    .get(missionId, mint) as { n: number };
  return {
    researchCallsInMission: count(mission.created_at),
    researchCallsSinceLastTrade: count(since),
    tokenReportBeforeBuying: reportedThis.n > 0,
    minutesIntoMission: Math.round((Date.now() - new Date(mission.created_at).getTime()) / 60_000),
  };
}

async function openOrAdd(args: {
  missionId: number;
  venue: string;
  asset: string;
  symbol: string;
  qty: number;
  costUsd: number;
  meta?: TradeMeta;
  mint?: string;
}) {
  const missionId = args.missionId;
  const existing = db
    .prepare("SELECT * FROM positions WHERE mission_id IS ? AND venue = ? AND asset = ? AND status = 'open'")
    .get(missionId, args.venue, args.asset) as PositionRow | undefined;
  if (existing) {
    db.prepare("UPDATE positions SET qty_open = qty_open + ?, cost_open_usd = cost_open_usd + ? WHERE id = ?").run(
      args.qty,
      args.costUsd,
      existing.id,
    );
    return;
  }
  const features = args.mint ? await entryFeatures(args.mint).catch(() => ({})) : {};
  const research = researchSnapshot(missionId, args.mint ?? args.asset);
  db.prepare(
    `INSERT INTO positions (mission_id, venue, asset, symbol, opened_at, qty_open, cost_open_usd, entry_features, research, thesis, lessons_applied)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    missionId,
    args.venue,
    args.asset,
    args.symbol,
    now(),
    args.qty,
    args.costUsd,
    JSON.stringify(features),
    JSON.stringify(research),
    args.meta?.thesis ?? null,
    args.meta?.lessonsApplied ?? null,
  );
}

function reduce(args: { missionId: number; venue: string; asset: string; qty: number; proceedsUsd: number; meta?: TradeMeta }) {
  const missionId = args.missionId;
  const p = db
    .prepare("SELECT * FROM positions WHERE mission_id IS ? AND venue = ? AND asset = ? AND status = 'open'")
    .get(missionId, args.venue, args.asset) as PositionRow | undefined;
  if (!p) return; // p. ej. el SOL inicial para fees: no es una posición abierta por el agente
  const fraction = Math.min(1, args.qty / p.qty_open);
  const costPart = p.cost_open_usd * fraction;
  const closed = fraction >= 0.999;
  db.prepare(
    `UPDATE positions SET qty_open = ?, cost_open_usd = ?, realized_cost_usd = realized_cost_usd + ?,
       realized_proceeds_usd = realized_proceeds_usd + ?, status = ?, closed_at = ?, exit_reason = COALESCE(?, exit_reason)
     WHERE id = ?`,
  ).run(
    closed ? 0 : p.qty_open - args.qty,
    closed ? 0 : p.cost_open_usd - costPart,
    costPart,
    args.proceedsUsd,
    closed ? "closed" : "open",
    closed ? now() : null,
    args.meta?.exitReason ?? (closed ? "venta del agente" : null),
    p.id,
  );
}

export async function recordSolanaSwap(args: {
  missionId: number;
  inputMint: string;
  outputMint: string;
  inputSymbol: string;
  outputSymbol: string;
  inAmount: number;
  outAmount: number;
  meta?: TradeMeta;
}) {
  const prices = await usdPrices([args.inputMint, args.outputMint]);
  const inUsd = (prices[args.inputMint] ?? 0) * args.inAmount;
  const outUsd = (prices[args.outputMint] ?? 0) * args.outAmount;
  // El valor de la operación: preferimos el lado estable si lo hay (es exacto).
  const valueUsd = CASH_MINTS.has(args.inputMint) ? args.inAmount : CASH_MINTS.has(args.outputMint) ? args.outAmount : inUsd || outUsd;
  if (!CASH_MINTS.has(args.inputMint)) {
    reduce({ missionId: args.missionId, venue: "solana", asset: args.inputMint, qty: args.inAmount, proceedsUsd: valueUsd, meta: args.meta });
  }
  if (!CASH_MINTS.has(args.outputMint)) {
    await openOrAdd({
      missionId: args.missionId,
      venue: "solana",
      asset: args.outputMint,
      symbol: args.outputSymbol,
      qty: args.outAmount,
      costUsd: valueUsd,
      meta: args.meta,
      mint: args.outputMint === SOL_MINT ? undefined : args.outputMint,
    });
  }
}

export async function recordBinanceTrade(args: {
  missionId: number;
  baseAsset: string;
  quoteAsset: string;
  side: "BUY" | "SELL";
  baseQty: number;
  quoteQty: number;
  fee: number;
  meta?: TradeMeta;
}) {
  // Aproximación: si el quote no es estable, su valor en USD se ignora (casi siempre se opera contra USDT/USDC).
  const quoteUsd = CASH_TICKERS.has(args.quoteAsset) ? 1 : 0;
  if (args.side === "BUY") {
    await openOrAdd({
      missionId: args.missionId,
      venue: "binance",
      asset: args.baseAsset,
      symbol: args.baseAsset,
      qty: args.baseQty - args.fee,
      costUsd: args.quoteQty * quoteUsd,
      meta: args.meta,
    });
  } else {
    reduce({ missionId: args.missionId, venue: "binance", asset: args.baseAsset, qty: args.baseQty, proceedsUsd: (args.quoteQty - args.fee) * quoteUsd, meta: args.meta });
  }
}

/** Posiciones con su resultado, para el propio agente y para las estadísticas de memoria. */
export function listPositions(missionId?: number) {
  const rows = (
    missionId === undefined
      ? db.prepare("SELECT * FROM positions ORDER BY id DESC").all()
      : db.prepare("SELECT * FROM positions WHERE mission_id = ? ORDER BY id DESC").all(missionId)
  ) as any[];
  return rows.map((p) => {
    const pnlUsd = p.status === "closed" ? p.realized_proceeds_usd - p.realized_cost_usd : null;
    return {
      id: p.id,
      missionId: p.mission_id,
      venue: p.venue,
      symbol: p.symbol,
      asset: p.asset,
      status: p.status,
      openedAt: p.opened_at,
      closedAt: p.closed_at,
      heldMinutes: p.closed_at ? Math.round((new Date(p.closed_at).getTime() - new Date(p.opened_at).getTime()) / 60_000) : null,
      costUsd: Number((p.realized_cost_usd + p.cost_open_usd).toFixed(2)),
      qtyOpen: p.qty_open,
      openCostUsd: Number(p.cost_open_usd.toFixed(2)),
      pnlUsd: pnlUsd === null ? null : Number(pnlUsd.toFixed(2)),
      pnlPct: pnlUsd === null || !p.realized_cost_usd ? null : Number(((pnlUsd / p.realized_cost_usd) * 100).toFixed(1)),
      exitReason: p.exit_reason,
      entry: JSON.parse(p.entry_features ?? "{}"),
      research: JSON.parse(p.research ?? "{}"),
      lessonsApplied: p.lessons_applied,
    };
  });
}

export function logResearch(missionId: number | null, tool: string, target?: string) {
  db.prepare("INSERT INTO research_log (ts, mission_id, tool, target) VALUES (?, ?, ?, ?)").run(now(), missionId, tool, target ?? null);
}
