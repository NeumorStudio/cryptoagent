// Memoria entre misiones, de tres tipos:
// - Procedimental (howtos): cómo se hace algo, qué falla y cómo evitarlo.
// - Creencias sobre el mercado (beliefs): su evidencia no la declara nadie; la calcula el simulador con
//   las posiciones reales (las que aplicaron la creencia y, si tiene condición, las que la cumplían).
// - Episódica: el diario de cada misión y su retrospectiva (mission_reviews).
//
// La escribe el agente revisor, no el que opera: así el agente no juzga sus propias decisiones.
// El que opera deja observaciones (report_observation) y el revisor decide qué pasa a la memoria.
import { db, logActivity, now } from "../db.js";
import { getActiveMission, getLastMission, getMission, type Mission } from "./mission.js";
import { listPositions } from "./positions.js";
import { DUPLICATE_THRESHOLD, fingerprint, similarity } from "./text.js";

// ─── Parecido entre misiones ────────────────────────────────────────────────

interface Profile {
  durationMinutes: number;
  targetPct: number;
  directed: boolean;
}

function profile(m: Pick<Mission, "created_at" | "deadline" | "initial_usd" | "target_usd" | "instructions">): Profile {
  return {
    durationMinutes: Math.max(1, Math.round((new Date(m.deadline).getTime() - new Date(m.created_at).getTime()) / 60_000)),
    targetPct: Number((((m.target_usd - m.initial_usd) / m.initial_usd) * 100).toFixed(1)),
    directed: !!m.instructions,
  };
}

/** Distancia entre perfiles: plazo en escala logarítmica, objetivo en tramos de 10 puntos, enfoque libre/dirigido. */
function distance(a: Profile, b: Profile) {
  return Math.abs(Math.log(a.durationMinutes / b.durationMinutes)) + Math.abs(a.targetPct - b.targetPct) / 10 + (a.directed === b.directed ? 0 : 0.5);
}

const similarityLabel = (d: number) => (d <= 0.6 ? "muy parecida" : d <= 1.5 ? "parecida" : "distinta");

const describe = (p: Profile) => `${p.durationMinutes} min, objetivo +${p.targetPct} %, ${p.directed ? "con instrucciones" : "modo libre"}`;

// ─── Condiciones de las creencias ───────────────────────────────────────────

type Pos = ReturnType<typeof listPositions>[number];

/** Datos de cada posición sobre los que puede definirse una condición. */
export const CONDITION_FIELDS = [
  "venue",
  "ageMinutes",
  "liquidityUsd",
  "mcapUsd",
  "priceChange5mPct",
  "priceChange1hPct",
  "holders",
  "topHoldersPct",
  "netBuyers5m",
  "organicScore",
  "launchpad",
  "rugcheckDangerRisks",
  "rugcheckWarnRisks",
  "buyTaxPct",
  "sellTaxPct",
  "honeypot",
  "mintable",
  "tokenReportBeforeBuying",
  "researchCallsSinceLastTrade",
  "minutesIntoMission",
] as const;
export const CONDITION_OPS = ["<", "<=", ">", ">=", "=", "!="] as const;

export interface Clause {
  f: (typeof CONDITION_FIELDS)[number];
  op: (typeof CONDITION_OPS)[number];
  v: number | string | boolean;
}
export interface Condition {
  all: Clause[];
}

const RESEARCH_FIELDS = new Set(["tokenReportBeforeBuying", "researchCallsSinceLastTrade", "minutesIntoMission"]);

function fieldValue(p: Pos, f: Clause["f"]): unknown {
  if (f === "venue") return p.entry.venue ?? p.venue;
  return RESEARCH_FIELDS.has(f) ? p.research[f] : p.entry[f];
}

/** Si una posición cumple la condición. Un dato desconocido no la cumple. */
export function matches(cond: Condition, p: Pos): boolean {
  return cond.all.every(({ f, op, v }) => {
    const x = fieldValue(p, f);
    if (x === undefined || x === null) return false;
    switch (op) {
      case "=":
        return x === v;
      case "!=":
        return x !== v;
      default:
        if (typeof x !== "number" || typeof v !== "number") return false;
        return op === "<" ? x < v : op === "<=" ? x <= v : op === ">" ? x > v : x >= v;
    }
  });
}

const describeCondition = (c: Condition) => c.all.map(({ f, op, v }) => `${f} ${op} ${JSON.stringify(v)}`).join(" y ");

// ─── Evidencia (calculada con las posiciones cerradas) ──────────────────────

/** Una operación cuenta como ganada o perdida si se movió al menos un 1 %. */
const outcome = (p: Pos) => ((p.pnlPct ?? 0) >= 1 ? "win" : (p.pnlPct ?? 0) <= -1 ? "loss" : "flat");

function summarizeTrades(ps: Pos[]) {
  if (!ps.length) return { trades: 0 };
  const avg = ps.reduce((s, p) => s + (p.pnlPct ?? 0), 0) / ps.length;
  return {
    trades: ps.length,
    wins: ps.filter((p) => outcome(p) === "win").length,
    losses: ps.filter((p) => outcome(p) === "loss").length,
    avgPnlPct: Number(avg.toFixed(1)),
    positionIds: ps.map((p) => p.id),
  };
}

interface BeliefRow {
  id: number;
  created_at: string;
  updated_at: string;
  source_mission_id: number | null;
  statement: string;
  applies_to: string;
  expectation: "positive" | "negative" | null;
  condition: string | null;
  fingerprint: string;
  status: string;
  status_reason: string | null;
  origin: string;
  legacy_evidence: string | null;
}

function beliefEvidence(b: BeliefRow, closed: Pos[]) {
  const applied = summarizeTrades(closed.filter((p) => p.beliefsApplied.includes(b.id)));
  const cond = b.condition ? (JSON.parse(b.condition) as Condition) : null;
  let matched: Record<string, unknown> | undefined;
  let verdict = applied.trades
    ? `sin condición; aplicada en ${applied.trades} operaciones: ${applied.wins} ganadas, ${applied.losses} perdidas (media ${applied.avgPnlPct} %)`
    : "sin condición y todavía sin operaciones que la apliquen";
  if (cond) {
    const ps = closed.filter((p) => matches(cond, p));
    const wins = ps.filter((p) => outcome(p) === "win").length;
    const losses = ps.filter((p) => outcome(p) === "loss").length;
    const [inFavor, against] = b.expectation === "negative" ? [losses, wins] : [wins, losses];
    const decided = inFavor + against;
    const support = decided ? Math.round((inFavor / decided) * 100) : null;
    matched = { ...summarizeTrades(ps), inFavor, against, supportPct: support };
    verdict =
      decided < 3
        ? `sin evidencia suficiente (${decided} operaciones decisivas; hacen falta al menos 3)`
        : support! >= 60
          ? `se sostiene (${inFavor} a favor, ${against} en contra)`
          : support! <= 40
            ? `los datos la contradicen (${inFavor} a favor, ${against} en contra)`
            : `dudosa (${inFavor} a favor, ${against} en contra)`;
  }
  return { verdict, appliedIn: applied, ...(matched ? { matchingTrades: matched } : {}) };
}

function beliefView(b: BeliefRow, closed: Pos[]) {
  const cond = b.condition ? (JSON.parse(b.condition) as Condition) : null;
  return {
    id: b.id,
    statement: b.statement,
    appliesTo: b.applies_to,
    ...(cond ? { condition: describeCondition(cond), expectation: b.expectation === "negative" ? "tiende a perder" : "tiende a ganar" } : {}),
    evidence: beliefEvidence(b, closed),
    ...(b.legacy_evidence ? { evidenceWrittenByTrader: b.legacy_evidence } : {}),
    sourceMission: b.source_mission_id,
    status: b.status,
    ...(b.status_reason ? { statusReason: b.status_reason } : {}),
  };
}

// ─── Lectura: lo que recuerda el agente ─────────────────────────────────────

function finishedMissions() {
  return db.prepare("SELECT * FROM missions WHERE status IN ('succeeded', 'expired', 'cancelled') ORDER BY id").all() as unknown as Mission[];
}

/** Resultados de las operaciones cerradas, agrupados por características medidas al entrar. */
function tradeStats(ps: Pos[]) {
  const groups: Array<[string, (p: Pos) => boolean]> = [
    ["todas", () => true],
    ["token con < 30 min de vida al comprar", (p) => (p.entry.ageMinutes ?? Infinity) < 30],
    ["token con ≥ 30 min de vida al comprar", (p) => (p.entry.ageMinutes ?? -1) >= 30],
    ["liquidez < 50.000 $", (p) => (p.entry.liquidityUsd ?? Infinity) < 50_000],
    ["liquidez ≥ 50.000 $", (p) => (p.entry.liquidityUsd ?? -1) >= 50_000],
    ["comprado tras subir > 20 % en 5 min", (p) => (p.entry.priceChange5mPct ?? -Infinity) > 20],
    ["comprado sin haber subido > 20 % en 5 min", (p) => (p.entry.priceChange5mPct ?? Infinity) <= 20],
    ["con token_report antes de comprar", (p) => p.research.tokenReportBeforeBuying === true],
    ["sin token_report antes de comprar", (p) => p.research.tokenReportBeforeBuying === false],
    ["con riesgos 'danger' en RugCheck", (p) => (p.entry.rugcheckDangerRisks ?? 0) > 0],
    ["cerradas por fin de misión", (p) => String(p.exitReason ?? "").startsWith("Cierre automático")],
  ];
  return groups
    .map(([label, fn]) => {
      const s = summarizeTrades(ps.filter(fn));
      return s.trades ? { group: label, trades: s.trades, wins: s.wins, losses: s.losses, avgPnlPct: s.avgPnlPct } : null;
    })
    .filter(Boolean);
}

const closedPositions = () => listPositions().filter((p) => p.status === "closed");

/**
 * La memoria completa, ordenada por relevancia para la misión actual (o la última).
 * `limit` recorta las listas largas (para el resumen de inicio de sesión).
 */
export function recall(missionId?: number | null, limit?: number) {
  const current = (missionId ? getMission(missionId) : undefined) ?? getActiveMission() ?? getLastMission();
  const curProfile = current ? profile(current) : null;
  const reviews = new Map(
    (db.prepare("SELECT mission_id, next_time, origin FROM mission_reviews").all() as Array<{ mission_id: number; next_time: string; origin: string }>).map((r) => [
      r.mission_id,
      r,
    ]),
  );

  const history = finishedMissions()
    .map((m) => {
      const p = profile(m);
      const d = curProfile ? distance(curProfile, p) : 0;
      const review = reviews.get(m.id);
      return {
        missionId: m.id,
        profile: describe(p),
        similarity: curProfile ? similarityLabel(d) : undefined,
        distance: Number(d.toFixed(2)),
        instructions: m.instructions ?? undefined,
        result:
          m.status === "cancelled"
            ? "cancelada por el usuario"
            : `${m.status === "succeeded" ? "objetivo conseguido" : "no llegó al objetivo"}: ${m.initial_usd} → ${m.final_usd?.toFixed(2)} USD (${(
                ((m.final_usd! - m.initial_usd) / m.initial_usd) *
                100
              ).toFixed(1)} %)`,
        ...(review && review.origin !== "legacy" ? { nextTime: review.next_time } : {}),
      };
    })
    .sort((a, b) => a.distance - b.distance);

  const closed = closedPositions();
  const distByMission = new Map(history.map((h) => [h.missionId, h.distance]));
  const beliefs = (db.prepare("SELECT * FROM beliefs WHERE status = 'active' ORDER BY id").all() as unknown as BeliefRow[])
    .map((b) => {
      const view = beliefView(b, closed);
      const n = (view.evidence.matchingTrades?.trades as number | undefined) ?? view.evidence.appliedIn.trades;
      // Más relevante: de misiones parecidas y con más operaciones que la respalden o la refuten.
      const score = (b.source_mission_id && distByMission.has(b.source_mission_id) ? distByMission.get(b.source_mission_id)! : 3) - Math.min(n, 10) * 0.1;
      return { ...view, relevance: b.source_mission_id && distByMission.has(b.source_mission_id) ? similarityLabel(distByMission.get(b.source_mission_id)!) : "general", _s: score };
    })
    .sort((a, b) => a._s - b._s)
    .map(({ _s, ...rest }) => rest);

  const howtos = db
    .prepare("SELECT id, scope, topic, title, steps, updated_at FROM howtos WHERE status = 'active' ORDER BY scope, topic, id")
    .all() as Array<Record<string, unknown>>;

  const similarIds = new Set(history.filter((h) => h.distance <= 1.5).map((h) => h.missionId));
  const cut = <T>(xs: T[]) => (limit ? xs.slice(0, limit) : xs);
  return {
    currentMission: current && curProfile ? { missionId: current.id, profile: describe(curProfile) } : null,
    missionHistory: cut(history),
    howtos,
    beliefs: cut(beliefs),
    totalBeliefs: beliefs.length,
    tradeStats: {
      note: "Resultados reales de las operaciones cerradas, calculados por el simulador. Ganada/perdida = se movió al menos un 1 %.",
      allMissions: tradeStats(closed),
      similarMissions: similarIds.size ? tradeStats(closed.filter((p) => p.missionId !== null && similarIds.has(p.missionId))) : [],
    },
    recurringErrors: recurringErrors(),
    apis: db.prepare("SELECT host, path, ok, fail, last_status, last_ok_at, last_fail_at FROM api_observations ORDER BY COALESCE(last_ok_at, last_fail_at) DESC LIMIT 25").all(),
  };
}

/** Errores de herramientas agrupados por tipo (últimos 30 días), con el howto que los resuelve si lo hay. */
export function recurringErrors() {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  return db
    .prepare(
      `SELECT error_class AS errorClass, tool, COUNT(*) AS count, MAX(ts) AS lastAt, MAX(id) AS exampleId, MAX(howto_id) AS howtoId
       FROM tool_errors WHERE ts >= ? GROUP BY error_class, tool ORDER BY count DESC, lastAt DESC LIMIT 20`,
    )
    .all(since);
}

// ─── Escritura (revisor) ────────────────────────────────────────────────────

function duplicateOf(table: "howtos" | "beliefs", fp: string, exceptId?: number) {
  const rows = db
    .prepare(`SELECT id, fingerprint FROM ${table} WHERE status = 'active' AND id IS NOT ?`)
    .all(exceptId ?? null) as Array<{ id: number; fingerprint: string }>;
  return rows.find((r) => similarity(r.fingerprint, fp) >= DUPLICATE_THRESHOLD)?.id;
}

export function writeHowto(a: { scope: string; topic: string; title: string; steps: string; missionId: number | null; fixesErrorIds?: number[] }) {
  const fp = fingerprint(`${a.title} ${a.steps}`);
  const dup = duplicateOf("howtos", fp);
  if (dup) throw new Error(`Ya hay un howto casi igual (#${dup}). Actualízalo con update_howto en lugar de crear otro.`);
  const id = Number(
    db
      .prepare(
        "INSERT INTO howtos (created_at, updated_at, scope, topic, title, steps, source_mission_id, fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(now(), now(), a.scope, a.topic, a.title, a.steps, a.missionId, fp).lastInsertRowid,
  );
  if (a.fixesErrorIds?.length) linkErrors(id, a.fixesErrorIds);
  return id;
}

/** Vincula un howto a los errores que resuelve (y a todos los del mismo tipo). */
function linkErrors(howtoId: number, errorIds: number[]) {
  const marks = errorIds.map(() => "?").join(",");
  db.prepare(`UPDATE tool_errors SET howto_id = ? WHERE error_class IN (SELECT error_class FROM tool_errors WHERE id IN (${marks}))`).run(howtoId, ...errorIds);
}

export function updateHowto(a: { id: number; title?: string; steps?: string; status?: "active" | "obsolete"; supersededBy?: number; fixesErrorIds?: number[] }) {
  const h = db.prepare("SELECT * FROM howtos WHERE id = ?").get(a.id) as { title: string; steps: string } | undefined;
  if (!h) throw new Error(`No existe el howto #${a.id}`);
  const title = a.title ?? h.title;
  const steps = a.steps ?? h.steps;
  db.prepare("UPDATE howtos SET title = ?, steps = ?, fingerprint = ?, status = COALESCE(?, status), superseded_by = COALESCE(?, superseded_by), updated_at = ? WHERE id = ?").run(
    title,
    steps,
    fingerprint(`${title} ${steps}`),
    a.status ?? null,
    a.supersededBy ?? null,
    now(),
    a.id,
  );
  if (a.fixesErrorIds?.length) linkErrors(a.id, a.fixesErrorIds);
}

function validateCondition(cond: Condition | undefined, expectation: string | undefined) {
  if (cond && !expectation) throw new Error("Una creencia con condición necesita expectation: positive (tiende a ganar) o negative (tiende a perder)");
}

const sameCondition = (cond: Condition | undefined) =>
  cond ? (db.prepare("SELECT id FROM beliefs WHERE status = 'active' AND condition = ?").get(JSON.stringify(cond)) as { id: number } | undefined)?.id : undefined;

export function writeBelief(a: { statement: string; appliesTo: string; expectation?: "positive" | "negative"; condition?: Condition; missionId: number | null }) {
  validateCondition(a.condition, a.expectation);
  const fp = fingerprint(a.statement);
  const dup = duplicateOf("beliefs", fp) ?? sameCondition(a.condition);
  if (dup) throw new Error(`Ya hay una creencia casi igual o con la misma condición (#${dup}). Corrígela con revise_belief en lugar de crear otra.`);
  const id = Number(
    db
      .prepare(
        `INSERT INTO beliefs (created_at, updated_at, source_mission_id, statement, applies_to, expectation, condition, fingerprint)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(now(), now(), a.missionId, a.statement, a.appliesTo, a.expectation ?? null, a.condition ? JSON.stringify(a.condition) : null, fp).lastInsertRowid,
  );
  return beliefView(getBelief(id), closedPositions());
}

function getBelief(id: number) {
  const b = db.prepare("SELECT * FROM beliefs WHERE id = ?").get(id) as unknown as BeliefRow | undefined;
  if (!b) throw new Error(`No existe la creencia #${id}`);
  return b;
}

export function reviseBelief(a: {
  id: number;
  statement?: string;
  appliesTo?: string;
  expectation?: "positive" | "negative";
  condition?: Condition;
  clearCondition?: boolean;
  retire?: boolean;
  reason: string;
}) {
  const b = getBelief(a.id);
  const statement = a.statement ?? b.statement;
  const condition = a.clearCondition ? null : a.condition ? JSON.stringify(a.condition) : b.condition;
  const expectation = a.expectation ?? b.expectation;
  validateCondition(condition ? (JSON.parse(condition) as Condition) : undefined, expectation ?? undefined);
  if (a.statement) {
    const dup = duplicateOf("beliefs", fingerprint(statement), a.id);
    if (dup) throw new Error(`Con ese texto sería casi igual que la creencia #${dup}. Si sobran, retira una de las dos.`);
  }
  db.prepare(
    `UPDATE beliefs SET statement = ?, applies_to = ?, expectation = ?, condition = ?, fingerprint = ?, status = ?, status_reason = ?, updated_at = ? WHERE id = ?`,
  ).run(statement, a.appliesTo ?? b.applies_to, expectation, condition, fingerprint(statement), a.retire ? "retired" : b.status, a.reason, now(), a.id);
  return beliefView(getBelief(a.id), closedPositions());
}

export function convertBeliefToHowto(a: { id: number; scope: string; topic: string; title: string; steps: string }) {
  const b = getBelief(a.id);
  if (b.status !== "active") throw new Error(`La creencia #${a.id} ya no está activa (${b.status})`);
  const howtoId = writeHowto({ scope: a.scope, topic: a.topic, title: a.title, steps: a.steps, missionId: b.source_mission_id });
  db.prepare("UPDATE howtos SET from_belief_id = ? WHERE id = ?").run(a.id, howtoId);
  db.prepare("UPDATE beliefs SET status = 'converted', status_reason = ?, updated_at = ? WHERE id = ?").run(`convertida en el howto #${howtoId}`, now(), a.id);
  return howtoId;
}

// ─── Misiones: estadísticas, retrospectiva y cola del revisor ───────────────

export function missionStats(missionId: number) {
  const ps = listPositions(missionId);
  const closed = ps.filter((p) => p.status === "closed");
  const count = (sql: string) => (db.prepare(sql).get(missionId) as { n: number }).n;
  const m = getMission(missionId);
  return {
    result:
      m?.final_usd != null
        ? { initialUsd: m.initial_usd, finalUsd: Number(m.final_usd.toFixed(2)), pct: Number((((m.final_usd - m.initial_usd) / m.initial_usd) * 100).toFixed(2)), status: m.status }
        : { initialUsd: m?.initial_usd, status: m?.status },
    positions: ps.length,
    closed: summarizeTrades(closed),
    realizedPnlUsd: Number(closed.reduce((s, p) => s + (p.pnlUsd ?? 0), 0).toFixed(2)),
    stillOpen: ps.filter((p) => p.status === "open").length,
    rejectedOrFailed: count("SELECT COUNT(*) AS n FROM journal WHERE mission_id = ? AND kind IN ('rejected', 'failed_tx', 'order_failed')"),
    toolErrors: count("SELECT COUNT(*) AS n FROM tool_errors WHERE mission_id = ?"),
    researchCalls: count("SELECT COUNT(*) AS n FROM research_log WHERE mission_id = ?"),
    observations: count("SELECT COUNT(*) AS n FROM observations WHERE mission_id = ?"),
  };
}

/** Misiones terminadas sin retrospectiva (las canceladas, solo si llegaron a operar). */
export function pendingReviews() {
  return (
    db
      .prepare(
        `SELECT m.id FROM missions m
         WHERE (m.status IN ('succeeded', 'expired') OR (m.status = 'cancelled' AND EXISTS (SELECT 1 FROM positions p WHERE p.mission_id = m.id)))
           AND m.reviewed_at IS NULL AND NOT EXISTS (SELECT 1 FROM mission_reviews r WHERE r.mission_id = m.id)
         ORDER BY m.id`,
      )
      .all() as Array<{ id: number }>
  ).map((r) => r.id);
}

export function writeMissionReview(a: { missionId: number; whatWasTried: string; whatHappened: string; surprises?: string; nextTime: string }) {
  const m = getMission(a.missionId);
  if (!m) throw new Error(`No existe la misión #${a.missionId}`);
  if (m.status === "active" || m.status === "closing") throw new Error(`La misión #${a.missionId} sigue activa: para revisarla a mitad usa review_checkpoint`);
  db.prepare(
    `INSERT INTO mission_reviews (mission_id, created_at, what_was_tried, what_happened, surprises, next_time) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(mission_id) DO UPDATE SET created_at = excluded.created_at, origin = 'reviewer', what_was_tried = excluded.what_was_tried,
       what_happened = excluded.what_happened, surprises = excluded.surprises, next_time = excluded.next_time`,
  ).run(a.missionId, now(), a.whatWasTried, a.whatHappened, a.surprises ?? null, a.nextTime);
  markReviewed(a.missionId);
  logActivity({ missionId: a.missionId, sessionId: null, kind: "review", title: `Retrospectiva de la misión #${a.missionId}`, body: a.nextTime });
  return missionStats(a.missionId);
}

export function markReviewed(missionId: number) {
  db.prepare("UPDATE missions SET reviewed_at = COALESCE(reviewed_at, ?) WHERE id = ?").run(now(), missionId);
}

/** Da por revisada una misión sin operaciones (no hay nada que analizar). */
export function markEmptyMissionReviewed(missionId: number, note: string) {
  if (listPositions(missionId).length) throw new Error(`La misión #${missionId} tuvo operaciones: escribe su retrospectiva con write_mission_review`);
  markReviewed(missionId);
  logActivity({ missionId, sessionId: null, kind: "review", title: `Misión #${missionId} revisada sin operaciones`, body: note });
}

function lastCheckpoint(missionId: number) {
  return (db.prepare("SELECT MAX(ts) AS ts FROM review_checkpoints WHERE mission_id = ?").get(missionId) as { ts: string | null }).ts;
}

/** Cada cuánto conviene revisar una misión activa: unas seis veces en toda la misión, entre 20 min y 6 h. */
export function reviewIntervalMinutes(m: Pick<Mission, "created_at" | "deadline">) {
  const duration = (new Date(m.deadline).getTime() - new Date(m.created_at).getTime()) / 60_000;
  return Math.round(Math.min(360, Math.max(20, duration / 6)));
}

/** Actividad del agente desde una fecha: operaciones, rechazos, observaciones y errores. */
function activitySince(missionId: number, since: string) {
  const q = (sql: string) => (db.prepare(sql).get(missionId, since) as { n: number }).n;
  return {
    trades: q("SELECT COUNT(*) AS n FROM journal WHERE mission_id = ? AND ts > ? AND kind IN ('swap', 'cex_order', 'transfer', 'failed_tx', 'rejected', 'order_placed', 'order_failed')"),
    observations: q("SELECT COUNT(*) AS n FROM observations WHERE mission_id = ? AND ts > ?"),
    errors: q("SELECT COUNT(*) AS n FROM tool_errors WHERE mission_id = ? AND ts > ?"),
  };
}

export function reviewCheckpoint(missionId: number, summary: string) {
  db.prepare("INSERT INTO review_checkpoints (ts, mission_id, summary) VALUES (?, ?, ?)").run(now(), missionId, summary);
  logActivity({ missionId, sessionId: null, kind: "review", title: "El revisor repasa la misión", body: summary });
}

/** Lo que tiene pendiente el revisor. */
export function reviewQueue() {
  const active = getActiveMission();
  let activeMission: Record<string, unknown> | null = null;
  if (active) {
    const since = lastCheckpoint(active.id) ?? active.created_at;
    const briefing = db.prepare("SELECT updated_at, seen_at FROM briefings WHERE mission_id = ?").get(active.id) as
      | { updated_at: string; seen_at: string | null }
      | undefined;
    activeMission = {
      missionId: active.id,
      profile: describe(profile(active)),
      instructions: active.instructions ?? undefined,
      deadline: active.deadline,
      reviewIntervalMinutes: reviewIntervalMinutes(active),
      lastCheckpointAt: lastCheckpoint(active.id),
      activitySinceLastCheckpoint: activitySince(active.id, since),
      briefing: briefing ? { updatedAt: briefing.updated_at, seenByTraderAt: briefing.seen_at } : "todavía no tiene briefing",
    };
  }
  const beliefsWithoutCondition = (db.prepare("SELECT id FROM beliefs WHERE status = 'active' AND condition IS NULL").all() as Array<{ id: number }>).map((r) => r.id);
  return {
    pendingFinalReviews: pendingReviews(),
    activeMission,
    pendingObservations: db.prepare("SELECT id, ts, mission_id, kind, text FROM observations WHERE status = 'pending' ORDER BY id").all(),
    errorsWithoutHowto: recurringErrors().filter((e: any) => !e.howtoId),
    beliefsWithoutCondition,
  };
}

/** Todo lo ocurrido en una misión (desde `since` si se indica), para revisarla en una sola llamada. */
export function missionReviewData(missionId: number, since?: string) {
  const m = getMission(missionId);
  if (!m) throw new Error(`No existe la misión #${missionId}`);
  const from = since ?? "";
  return {
    mission: { ...m, profile: describe(profile(m)) },
    stats: missionStats(missionId),
    briefing: db.prepare("SELECT text, updated_at, seen_at FROM briefings WHERE mission_id = ?").get(missionId) ?? null,
    checkpoints: db.prepare("SELECT ts, summary FROM review_checkpoints WHERE mission_id = ? ORDER BY id").all(missionId),
    positions: listPositions(missionId),
    journal: db.prepare("SELECT ts, kind, summary, reasoning, details FROM journal WHERE mission_id = ? AND ts > ? ORDER BY id LIMIT 400").all(missionId, from),
    workLog: db
      .prepare("SELECT ts, kind, title FROM activity WHERE mission_id = ? AND ts > ? AND kind IN ('thought', 'text') ORDER BY id LIMIT 300")
      .all(missionId, from),
    notes: db.prepare("SELECT ts, text FROM notes WHERE mission_id = ? ORDER BY id").all(missionId),
    observations: db.prepare("SELECT id, ts, kind, text, status FROM observations WHERE mission_id = ? ORDER BY id").all(missionId),
    toolErrors: db.prepare("SELECT id, ts, tool, error_class, message, howto_id FROM tool_errors WHERE mission_id = ? AND ts > ? ORDER BY id").all(missionId, from),
  };
}

/**
 * Espera (hasta `maxMinutes`) a que haya algo que revisar en la misión activa: que termine, que toque
 * la revisión periódica o que se acumule actividad del agente.
 */
export async function waitForActivity(maxMinutes: number) {
  const until = Date.now() + maxMinutes * 60_000;
  for (;;) {
    const m = getActiveMission();
    if (!m) {
      const last = getLastMission();
      return { reason: "mission_ended", missionId: last?.id, status: last?.status, pendingFinalReviews: pendingReviews() };
    }
    const since = lastCheckpoint(m.id) ?? m.created_at;
    const minutesSince = (Date.now() - new Date(since).getTime()) / 60_000;
    const activity = activitySince(m.id, since);
    const interval = reviewIntervalMinutes(m);
    if (minutesSince >= interval) return { reason: "interval_due", missionId: m.id, minutesSinceLastReview: Math.round(minutesSince), activity };
    if (minutesSince >= 10 && activity.trades + activity.observations + activity.errors >= 5) {
      return { reason: "activity", missionId: m.id, minutesSinceLastReview: Math.round(minutesSince), activity };
    }
    if (Date.now() >= until) {
      return { reason: "timeout", missionId: m.id, minutesSinceLastReview: Math.round(minutesSince), nextReviewInMinutes: Math.round(interval - minutesSince), activity };
    }
    await new Promise((r) => setTimeout(r, Math.min(20_000, until - Date.now())));
  }
}

// ─── Briefing: lo que el revisor quiere que el agente tenga presente ────────

export function writeBriefing(missionId: number, text: string) {
  const m = getMission(missionId);
  if (!m) throw new Error(`No existe la misión #${missionId}`);
  db.prepare(
    `INSERT INTO briefings (mission_id, created_at, updated_at, text) VALUES (?, ?, ?, ?)
     ON CONFLICT(mission_id) DO UPDATE SET updated_at = excluded.updated_at, text = excluded.text`,
  ).run(missionId, now(), now(), text);
  logActivity({ missionId, sessionId: null, kind: "review", title: "El revisor actualiza el briefing del agente", body: text });
}

export function getBriefing(missionId: number) {
  return db.prepare("SELECT text, updated_at, seen_at FROM briefings WHERE mission_id = ?").get(missionId) as
    | { text: string; updated_at: string; seen_at: string | null }
    | undefined;
}

export function markBriefingSeen(missionId: number) {
  db.prepare("UPDATE briefings SET seen_at = ? WHERE mission_id = ?").run(now(), missionId);
}

/** Si el revisor ha cambiado el briefing desde la última vez que lo vio el agente, lo devuelve (y lo marca como visto). */
export function takeBriefingNews(missionId: number): string | null {
  const b = getBriefing(missionId);
  if (!b || (b.seen_at && b.seen_at >= b.updated_at)) return null;
  markBriefingSeen(missionId);
  return b.text;
}

// ─── Capacidades que el agente echa en falta ────────────────────────────────

export const CAPABILITY_CATEGORIES = ["cuenta", "herramienta", "datos", "mercado", "otro"] as const;

/** Anota una capacidad que el agente necesitaría. Si ya estaba pedida (abierta), suma la petición. */
export function requestCapability(a: {
  source: "trader" | "reviewer";
  missionId: number | null;
  category: (typeof CAPABILITY_CATEGORIES)[number];
  capability: string;
  why: string;
  plan: string;
}) {
  const fp = fingerprint(a.capability);
  const open = db.prepare("SELECT id, fingerprint, missions FROM capability_requests WHERE status = 'open'").all() as Array<{ id: number; fingerprint: string; missions: string }>;
  const same = open.find((r) => similarity(r.fingerprint, fp) >= DUPLICATE_THRESHOLD);
  if (same) {
    const missions = new Set(JSON.parse(same.missions) as number[]);
    if (a.missionId !== null) missions.add(a.missionId);
    db.prepare("UPDATE capability_requests SET times_requested = times_requested + 1, missions = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify([...missions]),
      now(),
      same.id,
    );
    return { id: same.id, duplicate: true };
  }
  const id = Number(
    db
      .prepare(
        `INSERT INTO capability_requests (created_at, updated_at, source, category, capability, why, plan, fingerprint, missions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(now(), now(), a.source, a.category, a.capability, a.why, a.plan, fp, JSON.stringify(a.missionId !== null ? [a.missionId] : [])).lastInsertRowid,
  );
  logActivity({ missionId: a.missionId, sessionId: null, kind: "request", title: `Pide: ${a.capability}`, body: a.why });
  return { id, duplicate: false };
}

export interface CapabilityRequest {
  id: number;
  created_at: string;
  updated_at: string;
  source: string;
  category: string;
  capability: string;
  why: string;
  plan: string;
  times_requested: number;
  missions: number[];
  status: string;
  response: string | null;
}

export function listCapabilityRequests(status: "open" | "all" = "open"): CapabilityRequest[] {
  return (
    db
      .prepare(`SELECT * FROM capability_requests ${status === "open" ? "WHERE status = 'open'" : ""} ORDER BY times_requested DESC, updated_at DESC`)
      .all() as Array<Omit<CapabilityRequest, "missions"> & { missions: string; fingerprint?: string }>
  ).map(({ fingerprint: _fp, ...r }) => ({ ...r, missions: JSON.parse(r.missions) as number[] }));
}

export function resolveCapabilityRequest(id: number, status: "accepted" | "rejected" | "done", response: string) {
  if (!db.prepare("UPDATE capability_requests SET status = ?, response = ?, updated_at = ? WHERE id = ?").run(status, response, now(), id).changes) {
    throw new Error(`No existe la petición #${id}`);
  }
}

// ─── Observaciones, errores y APIs (los registra el simulador o el agente que opera) ──

export function reportObservation(missionId: number | null, sessionId: number | null, kind: string, text: string) {
  return Number(
    db.prepare("INSERT INTO observations (ts, mission_id, session_id, kind, text) VALUES (?, ?, ?, ?, ?)").run(now(), missionId, sessionId, kind, text)
      .lastInsertRowid,
  );
}

export function resolveObservation(id: number, status: "used" | "dismissed", resolution: string) {
  if (!db.prepare("UPDATE observations SET status = ?, resolved_at = ?, resolution = ? WHERE id = ?").run(status, now(), resolution, id).changes) {
    throw new Error(`No existe la observación #${id}`);
  }
}

/** Tipo de error: el mensaje sin direcciones, números ni detalles variables, para agrupar los repetidos. */
export function errorClass(message: string) {
  return message
    .replace(/0x[0-9a-fA-F]{6,}/g, "<dirección>")
    .replace(/[1-9A-HJ-NP-Za-km-z]{32,44}/g, "<dirección>")
    .replace(/\d+([.,]\d+)?(e-?\d+)?/g, "N")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function recordToolError(a: { missionId: number | null; sessionId: number | null; tool: string; input: unknown; message: string }) {
  const input = (a.input ?? {}) as Record<string, unknown>;
  const venue = typeof input.chain === "string" ? input.chain : typeof input.from === "string" ? input.from : a.tool.includes("binance") ? "binance" : null;
  db.prepare("INSERT INTO tool_errors (ts, mission_id, session_id, tool, venue, error_class, message, input) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    now(),
    a.missionId,
    a.sessionId,
    a.tool,
    venue,
    errorClass(a.message),
    a.message.slice(0, 1000),
    JSON.stringify(a.input ?? null).slice(0, 2000),
  );
}

/** Anota si una API respondió bien (lo usa http_get). La ruta se recorta a sus tres primeros tramos. */
export function recordApiCall(url: string, status: number) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return;
  }
  const path = "/" + u.pathname.split("/").filter(Boolean).slice(0, 3).join("/");
  const ok = status >= 200 && status < 300;
  db.prepare(
    `INSERT INTO api_observations (host, path, ok, fail, last_status, last_ok_at, last_fail_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(host, path) DO UPDATE SET ok = ok + excluded.ok, fail = fail + excluded.fail, last_status = excluded.last_status,
       last_ok_at = COALESCE(excluded.last_ok_at, last_ok_at), last_fail_at = COALESCE(excluded.last_fail_at, last_fail_at)`,
  ).run(u.host, path, ok ? 1 : 0, ok ? 0 : 1, status, ok ? now() : null, ok ? null : now());
}

// ─── Creencias citadas en las tesis ─────────────────────────────────────────

export function activeBeliefIds(): number[] {
  return (db.prepare("SELECT id FROM beliefs WHERE status = 'active' ORDER BY id").all() as Array<{ id: number }>).map((r) => r.id);
}

/** Ids citados que no corresponden a una creencia activa. */
export function unknownBeliefs(ids: number[]): number[] {
  const active = new Set(activeBeliefIds());
  return [...new Set(ids)].filter((id) => !active.has(id));
}

/** Última revisión (a mitad de misión) del revisor, o null si no ha revisado aún. */
export const lastReviewAt = (missionId: number) => lastCheckpoint(missionId);
