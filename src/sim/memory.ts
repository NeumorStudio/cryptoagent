// Memoria entre misiones: lecciones con contexto, similitud entre misiones y estadísticas
// objetivas de las operaciones. Lo que el agente recuerda se ordena por parecido a la misión actual.
import { db, now } from "../db.js";
import { getActiveMission, getLastMission, getMission, type Mission } from "./mission.js";
import { listPositions } from "./positions.js";

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

function finishedMissions() {
  return db.prepare("SELECT * FROM missions WHERE status IN ('succeeded', 'expired', 'cancelled') ORDER BY id").all() as unknown as Mission[] &
    Array<{ reviewed_at: string | null }>;
}

/** Misiones terminadas (no canceladas) que el agente aún no ha revisado. */
export function pendingReviews() {
  return (
    db
      .prepare(
        `SELECT m.id FROM missions m
         WHERE m.status IN ('succeeded', 'expired') AND m.reviewed_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM lessons l WHERE l.mission_id = m.id)
         ORDER BY m.id`,
      )
      .all() as Array<{ id: number }>
  ).map((r) => r.id);
}

export function markReviewed(missionId: number) {
  db.prepare("UPDATE missions SET reviewed_at = COALESCE(reviewed_at, ?) WHERE id = ?").run(now(), missionId);
}

type Pos = ReturnType<typeof listPositions>[number];

function summarize(label: string, ps: Pos[]) {
  const closed = ps.filter((p) => p.pnlPct !== null);
  if (!closed.length) return null;
  const wins = closed.filter((p) => (p.pnlUsd ?? 0) > 0).length;
  const avg = closed.reduce((s, p) => s + (p.pnlPct ?? 0), 0) / closed.length;
  return { group: label, trades: closed.length, winRatePct: Math.round((wins / closed.length) * 100), avgPnlPct: Number(avg.toFixed(1)) };
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
  return groups.map(([label, fn]) => summarize(label, ps.filter(fn))).filter(Boolean);
}

/**
 * Lo que el agente recuerda, ordenado por relevancia para la misión actual (o la última).
 * `limitLessons` recorta la lista para el resumen de inicio de sesión.
 */
export function recall(missionId?: number | null, limitLessons?: number) {
  const current = (missionId ? getMission(missionId) : undefined) ?? getActiveMission() ?? getLastMission();
  const curProfile = current ? profile(current) : null;

  const history = finishedMissions()
    .filter((m) => m.id !== current?.id || m.status !== "active")
    .map((m) => {
      const p = profile(m);
      const d = curProfile ? distance(curProfile, p) : 0;
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
      };
    })
    .sort((a, b) => a.distance - b.distance);

  const distByMission = new Map(history.map((h) => [h.missionId, h.distance]));
  const lessons = (
    db.prepare("SELECT id, created_at, mission_id, text, applies_to, evidence, confidence FROM lessons ORDER BY id").all() as any[]
  )
    .map((l) => ({
      id: l.id,
      missionId: l.mission_id,
      lesson: l.text,
      appliesTo: l.applies_to ?? "(sin especificar)",
      evidence: l.evidence ?? undefined,
      confidence: l.confidence ?? undefined,
      relevance: l.mission_id && distByMission.has(l.mission_id) ? similarityLabel(distByMission.get(l.mission_id)!) : "sin misión vinculada",
      _d: l.mission_id && distByMission.has(l.mission_id) ? distByMission.get(l.mission_id)! : 99,
    }))
    .sort((a, b) => a._d - b._d)
    .map(({ _d, ...rest }) => rest);

  const all = listPositions();
  const similarIds = new Set(history.filter((h) => h.distance <= 1.5).map((h) => h.missionId));
  return {
    currentMission: current && curProfile ? { missionId: current.id, profile: describe(curProfile) } : null,
    pendingReview: pendingReviews(),
    missionHistory: history,
    lessons: limitLessons ? lessons.slice(0, limitLessons) : lessons,
    totalLessons: lessons.length,
    tradeStats: {
      note: "Resultados reales de tus operaciones cerradas, calculados por el simulador (no por ti).",
      allMissions: tradeStats(all),
      similarMissions: similarIds.size ? tradeStats(all.filter((p) => p.missionId !== null && similarIds.has(p.missionId))) : [],
    },
  };
}
