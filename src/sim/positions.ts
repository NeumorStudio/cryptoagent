// Registro objetivo de posiciones: el simulador anota cada compra y venta con sus datos reales,
// para que el agente aprenda de resultados medidos y no de su propia impresión.
import { db, now } from "../db.js";
import type { Features, TradeMeta, VenueId } from "./types.js";
import { getVenue } from "./venues/index.js";

export type { TradeMeta };

interface PositionRow {
  id: number;
  qty_open: number;
  cost_open_usd: number;
  realized_cost_usd: number;
  realized_proceeds_usd: number;
  entry_features: string | null;
  research: string | null;
  thesis: string | null;
  lessons_applied: string | null;
  beliefs_applied: string | null;
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

/**
 * Cómo decide el agente, no cómo es el token: qué parte de su capital pone en esta posición, si vuelve a un
 * token que ya operó (y cómo le fue) y cuánto queda de misión. Con estos datos en las condiciones de las
 * creencias, el revisor puede aprender reglas de tamaño y de reentrada con evidencia medida, igual que con
 * los datos del token; nadie se las impone.
 * Capital = efectivo (estables de todas las cadenas) + coste de las posiciones abiertas. `cashSpent`: si el
 * efectivo de esta compra ya ha salido de la cartera (al registrarla) o todavía no (al decidirla).
 */
export function decisionContext(missionId: number, venue: string, asset: string, addUsd: number, cashSpent: boolean) {
  const cash = (db.prepare("SELECT venue, asset, amount FROM holdings WHERE mission_id = ?").all(missionId) as Array<{ venue: VenueId; asset: string; amount: number }>)
    .filter((h) => {
      try {
        return getVenue(h.venue).isCash(h.asset);
      } catch {
        return false;
      }
    })
    .reduce((s, h) => s + h.amount, 0);
  const openCost = (db.prepare("SELECT COALESCE(SUM(cost_open_usd), 0) AS c FROM positions WHERE mission_id = ? AND status = 'open'").get(missionId) as { c: number }).c;
  const existing = (db.prepare("SELECT COALESCE(SUM(cost_open_usd), 0) AS c FROM positions WHERE mission_id = ? AND venue = ? AND asset = ? AND status = 'open'").get(missionId, venue, asset) as { c: number }).c;
  const capital = cash + openCost + (cashSpent ? addUsd : 0);
  const previous = db
    .prepare("SELECT realized_cost_usd AS c, realized_proceeds_usd AS p FROM positions WHERE venue = ? AND asset = ? AND status = 'closed' ORDER BY closed_at DESC")
    .all(venue, asset) as Array<{ c: number; p: number }>;
  const deadline = (db.prepare("SELECT deadline FROM missions WHERE id = ?").get(missionId) as { deadline: string } | undefined)?.deadline;
  return {
    ...(capital > 0 && addUsd > 0 ? { portfolioPct: Math.round(((existing + addUsd) / capital) * 100) } : {}),
    previousTradesInToken: previous.length,
    ...(previous[0] && previous[0].c > 0 ? { lastPnlInTokenPct: Math.round((previous[0].p / previous[0].c - 1) * 100) } : {}),
    ...(deadline ? { minutesLeft: Math.max(0, Math.round((new Date(deadline).getTime() - Date.now()) / 60_000)) } : {}),
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
  /** Datos del token al entrar (solo si es una posición nueva). */
  features?: () => Promise<Features>;
  /** Posición que llega de otro sitio: conserva sus datos de entrada, investigación y tesis. */
  inherit?: Pick<PositionRow, "entry_features" | "research" | "thesis" | "lessons_applied" | "beliefs_applied">;
}) {
  const missionId = args.missionId;
  const existing = db
    .prepare("SELECT * FROM positions WHERE mission_id IS ? AND venue = ? AND asset = ? AND status = 'open'")
    .get(missionId, args.venue, args.asset) as PositionRow | undefined;
  if (existing) {
    // Ampliar una posición: se anota la mayor parte del capital que llegó a tener y si se compró más con ella en
    // pérdidas (promediar a la baja), que es una decisión distinta de la entrada.
    const research = JSON.parse(existing.research ?? "{}") as Record<string, unknown>;
    if (!args.inherit && args.qty > 0 && existing.qty_open > 0) {
      const ctx = decisionContext(missionId, args.venue, args.asset, args.costUsd, true);
      const avgCost = existing.cost_open_usd / existing.qty_open;
      research.portfolioPct = Math.max(Number(research.portfolioPct ?? 0), ctx.portfolioPct ?? 0);
      research.adds = Number(research.adds ?? 0) + 1;
      research.addedWhileDown = Boolean(research.addedWhileDown) || args.costUsd / args.qty < avgCost * 0.97;
    }
    db.prepare("UPDATE positions SET qty_open = qty_open + ?, cost_open_usd = cost_open_usd + ?, research = ? WHERE id = ?").run(
      args.qty,
      args.costUsd,
      JSON.stringify(research),
      existing.id,
    );
    return;
  }
  const features = args.inherit
    ? args.inherit.entry_features
    : JSON.stringify(args.features ? await args.features().catch(() => ({ venue: args.venue })) : { venue: args.venue });
  const research = args.inherit
    ? args.inherit.research
    : JSON.stringify({ ...researchSnapshot(missionId, args.asset), ...decisionContext(missionId, args.venue, args.asset, args.costUsd, true), adds: 0, addedWhileDown: false });
  db.prepare(
    `INSERT INTO positions (mission_id, venue, asset, symbol, opened_at, qty_open, cost_open_usd, entry_features, research, thesis, lessons_applied, beliefs_applied)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    missionId,
    args.venue,
    args.asset,
    args.symbol,
    now(),
    args.qty,
    args.costUsd,
    features,
    research,
    args.inherit ? args.inherit.thesis : (args.meta?.thesis ?? null),
    args.inherit ? args.inherit.lessons_applied : (args.meta?.lessonsApplied ?? null),
    args.inherit ? args.inherit.beliefs_applied : args.meta?.beliefsApplied?.length ? JSON.stringify(args.meta.beliefsApplied) : null,
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

/**
 * Registra una operación: reduce la posición del activo vendido y abre (o amplía) la del comprado.
 * Las stablecoins no son posiciones. `valueUsd` es el valor de la operación en USD.
 */
export async function recordTrade(args: {
  missionId: number;
  venue: VenueId;
  sold: { asset: string; qty: number };
  bought: { asset: string; symbol: string; qty: number };
  valueUsd: number;
  meta?: TradeMeta;
}) {
  const venue = getVenue(args.venue);
  if (!venue.isCash(args.sold.asset)) {
    reduce({ missionId: args.missionId, venue: args.venue, asset: args.sold.asset, qty: args.sold.qty, proceedsUsd: args.valueUsd, meta: args.meta });
  }
  if (!venue.isCash(args.bought.asset)) {
    // El nativo de la cadena no tiene datos de token que medir.
    const measurable = venue.kind === "chain" && args.bought.asset !== venue.native.address;
    await openOrAdd({
      missionId: args.missionId,
      venue: args.venue,
      asset: args.bought.asset,
      symbol: args.bought.symbol,
      qty: args.bought.qty,
      costUsd: args.valueUsd,
      meta: args.meta,
      features: measurable ? () => venue.entryFeatures(args.bought.asset) : undefined,
    });
  }
}

/** Parte de una posición que viaja con una transferencia: su coste y sus datos de entrada. */
export interface Carry {
  /** Fracción de lo enviado que era posición (el resto era saldo que no se compró, p. ej. el gas inicial). */
  share: number;
  costUsd: number;
  row: Pick<PositionRow, "entry_features" | "research" | "thesis" | "lessons_applied" | "beliefs_applied">;
}

/**
 * Saca de una posición lo que se envía a otro sitio. No es una venta: devuelve el coste que viaja con
 * el activo (o null si ese saldo no era una posición), para attachPosition cuando llegue.
 */
export function detachPosition(args: { missionId: number; venue: VenueId; asset: string; qty: number; toVenue: VenueId }): Carry | null {
  const p = db
    .prepare("SELECT * FROM positions WHERE mission_id = ? AND venue = ? AND asset = ? AND status = 'open'")
    .get(args.missionId, args.venue, args.asset) as PositionRow | undefined;
  if (!p) return null; // saldo que no era una posición (p. ej. el SOL inicial para fees)
  const qty = Math.min(args.qty, p.qty_open);
  const fraction = p.qty_open > 0 ? qty / p.qty_open : 0;
  const costPart = p.cost_open_usd * fraction;
  const all = fraction >= 0.999;
  db.prepare("UPDATE positions SET qty_open = ?, cost_open_usd = ?, status = ?, closed_at = ?, exit_reason = COALESCE(?, exit_reason) WHERE id = ?").run(
    all ? 0 : p.qty_open - qty,
    all ? 0 : p.cost_open_usd - costPart,
    all ? "moved" : "open",
    all ? now() : null,
    all ? `transferida a ${args.toVenue}` : null,
    p.id,
  );
  return { share: args.qty > 0 ? qty / args.qty : 0, costUsd: costPart, row: p };
}

/** Pone en el destino lo que llegó de una transferencia, con el coste y los datos que traía. */
export async function attachPosition(args: { missionId: number; venue: VenueId; asset: string; symbol: string; received: number; carry: Carry }) {
  const qty = args.received * args.carry.share;
  if (qty <= 0) return;
  await openOrAdd({ missionId: args.missionId, venue: args.venue, asset: args.asset, symbol: args.symbol, qty, costUsd: args.carry.costUsd, inherit: args.carry.row });
}

/** Cierra (parte de) una posición a un valor en USD, fuera de un swap (p. ej. al cruzar un puente cambiando de token). */
export function sellFromPosition(args: { missionId: number; venue: VenueId; asset: string; qty: number; proceedsUsd: number; meta?: TradeMeta }) {
  reduce(args);
}

/** Abre (o amplía) una posición fuera de un swap (p. ej. al llegar un puente con otro token). */
export async function buyIntoPosition(args: { missionId: number; venue: VenueId; asset: string; symbol: string; qty: number; costUsd: number; meta?: TradeMeta }) {
  const venue = getVenue(args.venue);
  const measurable = venue.kind === "chain" && args.asset !== venue.native.address;
  await openOrAdd({ ...args, features: measurable ? () => venue.entryFeatures(args.asset) : undefined });
}

/**
 * Mueve (parte de) una posición a otro sitio en el acto. No es una venta: el coste viaja con el activo
 * y el resultado se mide cuando se venda en el destino. `received` puede ser menor que `qty` por las comisiones.
 */
export async function movePosition(args: {
  missionId: number;
  from: { venue: VenueId; asset: string };
  to: { venue: VenueId; asset: string; symbol: string };
  qty: number;
  received: number;
}) {
  const carry = detachPosition({ missionId: args.missionId, venue: args.from.venue, asset: args.from.asset, qty: args.qty, toVenue: args.to.venue });
  if (carry) await attachPosition({ missionId: args.missionId, venue: args.to.venue, asset: args.to.asset, symbol: args.to.symbol, received: args.received, carry });
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
      thesis: p.thesis,
      lessonsApplied: p.lessons_applied,
      beliefsApplied: JSON.parse(p.beliefs_applied ?? "[]") as number[],
    };
  });
}

export function logResearch(missionId: number | null, tool: string, target?: string) {
  db.prepare("INSERT INTO research_log (ts, mission_id, tool, target) VALUES (?, ?, ?, ?)").run(now(), missionId, tool, target ?? null);
}
