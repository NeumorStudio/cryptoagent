// Misión: capital inicial ficticio, objetivo y plazo real. Termina sola cuando la cartera
// llega al objetivo o se acaba el tiempo; entonces se cierran todas las posiciones a mercado.
//
// Hay una "misión principal" (la del usuario, lab_run_id NULL) y, en el laboratorio, tandas de
// varias misiones a la vez, cada una con su propia cartera, órdenes, diario y posiciones.
import { db, logJournal, now } from "../db.js";
import { liquidateAll, resetPortfolio, solUsdPrice, valuation } from "./portfolio.js";

export interface Mission {
  id: number;
  created_at: string;
  initial_usd: number;
  target_usd: number;
  deadline: string;
  status: "active" | "closing" | "succeeded" | "expired" | "cancelled";
  ended_at: string | null;
  final_usd: number | null;
  instructions: string | null;
  reviewed_at: string | null;
  lab_run_id: number | null;
  lab_group: string | null;
  lab_label: string | null;
  benchmark_sol_price: number | null;
}

export type LabGroup = "control" | "memoria" | "explorador";

export function getMission(id: number): Mission | undefined {
  return db.prepare("SELECT * FROM missions WHERE id = ?").get(id) as Mission | undefined;
}

/** Misión principal activa (la del usuario, fuera del laboratorio). */
export function getActiveMission(): Mission | undefined {
  return db.prepare("SELECT * FROM missions WHERE status = 'active' AND lab_run_id IS NULL ORDER BY id DESC LIMIT 1").get() as
    | Mission
    | undefined;
}

/** Última misión principal, activa o no. */
export function getLastMission(): Mission | undefined {
  return db.prepare("SELECT * FROM missions WHERE lab_run_id IS NULL ORDER BY id DESC LIMIT 1").get() as Mission | undefined;
}

/** Todas las misiones activas: la principal y las del laboratorio. */
export function activeMissions(): Mission[] {
  return db.prepare("SELECT * FROM missions WHERE status = 'active' ORDER BY id").all() as unknown as Mission[];
}

/** Historial objetivo de misiones principales terminadas (lo calcula el simulador, no el agente). */
export function missionHistory() {
  const rows = db
    .prepare(
      `SELECT m.*, (SELECT COUNT(*) FROM lessons l WHERE l.mission_id = m.id) AS lessons
       FROM missions m WHERE m.status NOT IN ('active', 'closing') AND m.lab_run_id IS NULL ORDER BY m.id`,
    )
    .all() as unknown as Array<Mission & { lessons: number }>;
  return rows.map((m) => {
    const minutes = Math.round((new Date(m.deadline).getTime() - new Date(m.created_at).getTime()) / 60_000);
    return {
      missionId: m.id,
      capitalUsd: m.initial_usd,
      targetUsd: m.target_usd,
      targetPct: Number((((m.target_usd - m.initial_usd) / m.initial_usd) * 100).toFixed(1)),
      durationMinutes: minutes,
      userInstructions: m.instructions ?? "ninguna (modo libre)",
      finalUsd: m.final_usd === null ? null : Number(m.final_usd.toFixed(2)),
      resultPct: m.final_usd === null ? null : Number((((m.final_usd - m.initial_usd) / m.initial_usd) * 100).toFixed(2)),
      outcome: m.status === "succeeded" ? "objetivo conseguido" : m.status === "expired" ? "no llegó al objetivo" : "cancelada",
      lessonsWritten: m.lessons,
    };
  });
}

function insertMission(args: {
  initialUsd: number;
  targetUsd: number;
  durationMinutes: number;
  instructions?: string;
  solPrice: number;
  lab?: { runId: number; group: LabGroup; label: string };
}): number {
  const deadline = new Date(Date.now() + args.durationMinutes * 60_000).toISOString();
  const id = Number(
    db
      .prepare(
        `INSERT INTO missions (created_at, initial_usd, target_usd, deadline, instructions, benchmark_sol_price, lab_run_id, lab_group, lab_label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        now(),
        args.initialUsd,
        args.targetUsd,
        deadline,
        args.instructions?.trim() || null,
        args.solPrice,
        args.lab?.runId ?? null,
        args.lab?.group ?? null,
        args.lab?.label ?? null,
      ).lastInsertRowid,
  );
  resetPortfolio(id, args.initialUsd, args.solPrice);
  logJournal({
    missionId: id,
    sessionId: null,
    kind: "mission",
    summary:
      `Misión #${id}${args.lab ? ` (${args.lab.label}, grupo ${args.lab.group})` : ""} iniciada: de ${args.initialUsd} USD a ${args.targetUsd} USD ` +
      `antes del ${new Date(deadline).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}`,
  });
  return id;
}

function validate(initialUsd: number, targetUsd: number, durationMinutes: number) {
  if (!(targetUsd > initialUsd)) throw new Error("El objetivo debe ser mayor que el capital inicial");
  if (!(durationMinutes > 0)) throw new Error("La duración debe ser positiva");
}

/** Crea la misión principal (cancela la anterior si seguía activa). */
export async function createMission(initialUsd: number, targetUsd: number, durationMinutes: number, instructions?: string): Promise<Mission> {
  validate(initialUsd, targetUsd, durationMinutes);
  const solPrice = await solUsdPrice();
  const previous = getActiveMission();
  if (previous) {
    db.prepare("UPDATE missions SET status = 'cancelled', ended_at = ? WHERE id = ?").run(now(), previous.id);
    db.prepare("UPDATE orders SET status = 'cancelled', closed_at = ? WHERE status = 'open' AND mission_id = ?").run(now(), previous.id);
    logJournal({ missionId: previous.id, sessionId: null, kind: "mission", summary: `Misión #${previous.id} cancelada por el usuario al crear una nueva` });
  }
  // Cada misión tiene su propia cartera, órdenes y notas: empieza de cero sin arrastrar nada de la anterior.
  return getMission(insertMission({ initialUsd, targetUsd, durationMinutes, instructions, solPrice }))!;
}

/**
 * Crea una tanda del laboratorio: `agents` misiones idénticas a la vez, repartidas entre grupos.
 * Todas parten del mismo precio de SOL, para que las carteras iniciales sean exactamente iguales.
 */
export async function createLabRun(args: {
  capitalUsd: number;
  targetUsd: number;
  durationMinutes: number;
  instructions?: string;
  groups: Partial<Record<LabGroup, number>>;
}) {
  validate(args.capitalUsd, args.targetUsd, args.durationMinutes);
  const running = activeLabRun();
  if (running) throw new Error(`Ya hay una tanda en curso (#${running.id}). Espera a que termine o detenla antes de lanzar otra.`);
  const plan = (Object.entries(args.groups) as Array<[LabGroup, number]>).filter(([, n]) => n > 0);
  const total = plan.reduce((s, [, n]) => s + n, 0);
  if (total < 1) throw new Error("La tanda necesita al menos un agente");
  if (total > 50) throw new Error("Como máximo 50 agentes por tanda");

  const solPrice = await solUsdPrice();
  const runId = Number(
    db
      .prepare("INSERT INTO lab_runs (created_at, capital_usd, target_usd, duration_minutes, instructions, groups) VALUES (?, ?, ?, ?, ?, ?)")
      .run(now(), args.capitalUsd, args.targetUsd, args.durationMinutes, args.instructions?.trim() || null, JSON.stringify(args.groups))
      .lastInsertRowid,
  );
  const missions: Array<{ missionId: number; label: string; group: LabGroup }> = [];
  let n = 0;
  for (const [group, count] of plan) {
    for (let i = 0; i < count; i++) {
      const label = `T${runId}-A${++n}`;
      const missionId = insertMission({
        initialUsd: args.capitalUsd,
        targetUsd: args.targetUsd,
        durationMinutes: args.durationMinutes,
        instructions: args.instructions,
        solPrice,
        lab: { runId, group, label },
      });
      missions.push({ missionId, label, group });
    }
  }
  return { runId, missions };
}

function remaining(deadline: string) {
  const ms = new Date(deadline).getTime() - Date.now();
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  return { ms, text: `${Math.floor(totalMin / 60)} h ${totalMin % 60} min` };
}

/** Estado de una misión (por defecto, la principal activa o la última). */
export async function missionStatus(missionId?: number) {
  const mission = missionId !== undefined ? getMission(missionId) : (getActiveMission() ?? getLastMission());
  if (!mission) return { active: false, message: "No hay ninguna misión. El usuario debe crear una con /trading en Claude Code (o `npm run mission`)." };
  if (mission.status !== "active") {
    return {
      active: false,
      message: `La misión #${mission.id} ha terminado (${mission.status}). No se puede operar hasta que el usuario cree una nueva.`,
      mission,
    };
  }
  const v = await valuation(mission.id);
  const left = remaining(mission.deadline);
  return {
    active: true,
    missionId: mission.id,
    ...(mission.lab_run_id ? { labRun: mission.lab_run_id, labLabel: mission.lab_label } : {}),
    initialUsd: mission.initial_usd,
    targetUsd: mission.target_usd,
    currentUsd: Number(v.totalUsd.toFixed(2)),
    missingUsd: Number((mission.target_usd - v.totalUsd).toFixed(2)),
    progressPct: Number((((v.totalUsd - mission.initial_usd) / (mission.target_usd - mission.initial_usd)) * 100).toFixed(1)),
    deadline: mission.deadline,
    timeLeft: left.text,
    userInstructions: mission.instructions ?? "ninguna: modo libre",
  };
}

/**
 * Detiene una misión por decisión del usuario (por defecto, la principal). Con closePositions,
 * cierra todas las posiciones a mercado (igual que al terminar); si no, la cartera queda tal cual.
 */
export async function stopMission(closePositions: boolean, missionId?: number): Promise<{ missionId: number; finalUsd: number; problems: string[] }> {
  const mission = missionId !== undefined ? getMission(missionId) : getActiveMission();
  if (!mission || mission.status !== "active") throw new Error("No hay ninguna misión activa");
  if (!db.prepare("UPDATE missions SET status = 'closing' WHERE id = ? AND status = 'active'").run(mission.id).changes) {
    throw new Error("La misión se está cerrando en este momento");
  }
  db.prepare("UPDATE orders SET status = 'cancelled', closed_at = ? WHERE status = 'open' AND mission_id = ?").run(now(), mission.id);
  const problems = closePositions ? await liquidateAll(mission.id, null, `Cierre manual: el usuario detuvo la misión #${mission.id}`) : [];
  const final = await valuation(mission.id, true);
  db.prepare("UPDATE missions SET status = 'cancelled', ended_at = ?, final_usd = ? WHERE id = ?").run(now(), final.totalUsd, mission.id);
  logJournal({
    missionId: mission.id,
    sessionId: null,
    kind: "mission",
    summary:
      `Misión #${mission.id} detenida por el usuario ${closePositions ? "cerrando posiciones" : "sin cerrar posiciones"}: ` +
      `${mission.initial_usd} → ${final.totalUsd.toFixed(2)} USD (objetivo ${mission.target_usd} USD)`,
    details: { problems },
  });
  closeFinishedLabRuns();
  return { missionId: mission.id, finalUsd: final.totalUsd, problems };
}

/** Comprueba una misión y la cierra si ha llegado al objetivo o se le ha acabado el plazo. */
async function checkOne(mission: Mission): Promise<string[]> {
  const expired = remaining(mission.deadline).ms <= 0;
  const v = await valuation(mission.id);
  const value = v.totalUsd;
  // Con un valor de reserva (sin cotización real) no se da el objetivo por conseguido.
  const reached = value >= mission.target_usd && v.reliable;
  if (!expired && !reached) return [];

  // Reclamo atómico: solo un proceso cierra la misión.
  const status = reached ? "succeeded" : "expired";
  if (!db.prepare("UPDATE missions SET status = 'closing' WHERE id = ? AND status = 'active'").run(mission.id).changes) return [];

  const reason = reached
    ? `Cierre automático: objetivo de la misión #${mission.id} alcanzado (${value.toFixed(2)} ≥ ${mission.target_usd} USD)`
    : `Cierre automático: se acabó el plazo de la misión #${mission.id}`;
  db.prepare("UPDATE orders SET status = 'cancelled', closed_at = ? WHERE status = 'open' AND mission_id = ?").run(now(), mission.id);
  const problems = await liquidateAll(mission.id, null, reason);
  const final = await valuation(mission.id, true);

  // El objetivo se detecta con el valor de liquidación estimado, pero lo que cuenta es lo
  // realizado al vender. Si al cerrar se queda corto y aún hay tiempo, la misión continúa.
  // Si alguna venta falló, el valor no está realizado: la misión sigue y se reintenta en la próxima revisión.
  if (reached && !expired && (final.totalUsd < mission.target_usd || problems.length)) {
    db.prepare("UPDATE missions SET status = 'active' WHERE id = ?").run(mission.id);
    const summary = problems.length
      ? `Misión #${mission.id}: objetivo alcanzado, pero no se pudo vender todo (${problems.join("; ")}). La misión continúa y se reintentará.`
      : `Misión #${mission.id}: al cerrar posiciones el resultado realizado (${final.totalUsd.toFixed(2)} USD) quedó por debajo ` +
        `del objetivo (${mission.target_usd} USD) por comisiones y slippage. La misión continúa.`;
    logJournal({ missionId: mission.id, sessionId: null, kind: "mission", summary, details: { problems } });
    return [summary];
  }

  db.prepare("UPDATE missions SET status = ?, ended_at = ?, final_usd = ? WHERE id = ?").run(status, now(), final.totalUsd, mission.id);
  const summary =
    `Misión #${mission.id} ${reached ? "CONSEGUIDA" : "TERMINADA POR TIEMPO"}: ${mission.initial_usd} → ${final.totalUsd.toFixed(2)} USD ` +
    `(objetivo ${mission.target_usd} USD)`;
  logJournal({ missionId: mission.id, sessionId: null, kind: "mission", summary, details: { problems } });
  closeFinishedLabRuns();
  return [summary, ...problems.map((p) => `No se pudo liquidar: ${p}`)];
}

/** Marca como terminadas las tandas cuyas misiones han terminado todas. */
function closeFinishedLabRuns() {
  db.prepare(
    `UPDATE lab_runs SET status = 'finished', ended_at = ?
     WHERE status = 'active' AND NOT EXISTS (
       SELECT 1 FROM missions m WHERE m.lab_run_id = lab_runs.id AND m.status IN ('active', 'closing')
     )`,
  ).run(now());
}

const checking = new Set<number>();

/**
 * Comprueba todas las misiones activas (la principal y las del laboratorio) y cierra las que
 * hayan terminado. Devuelve líneas de log. Si se indica una misión, solo comprueba esa.
 */
export async function checkMission(missionId?: number): Promise<string[]> {
  const targets = missionId !== undefined ? [getMission(missionId)].filter((m): m is Mission => m?.status === "active") : activeMissions();
  const results = await Promise.all(
    targets.map(async (m) => {
      if (checking.has(m.id)) return [];
      checking.add(m.id);
      try {
        return await checkOne(m);
      } catch (err) {
        return [`Error revisando la misión #${m.id}: ${(err as Error).message}`];
      } finally {
        checking.delete(m.id);
      }
    }),
  );
  return results.flat();
}

/** Tanda del laboratorio en curso, si la hay. */
export function activeLabRun(): { id: number } | undefined {
  return db.prepare("SELECT id FROM lab_runs WHERE status = 'active' ORDER BY id DESC LIMIT 1").get() as { id: number } | undefined;
}

export const GROUP_RULES: Record<LabGroup, string> = {
  control: "Grupo CONTROL: trabajas sin memoria de misiones anteriores. Sirves de referencia para medir si la memoria ayuda.",
  memoria:
    "Grupo MEMORIA: tienes acceso al manual de estrategia del laboratorio (recall_lessons), con lo aprendido en tandas anteriores y las estadísticas de sus operaciones.",
  explorador:
    "Grupo EXPLORADOR: tu papel es descubrir cosas nuevas. No puedes comprar tokens que ya se operaron en tandas anteriores del laboratorio (la lista está en tu misión) ni los que compre antes que tú otro agente de tu tanda.",
};

/**
 * Tokens que el explorador no puede comprar: los operados en tandas anteriores y los que ya compró
 * otro agente de su tanda (salvo él mismo, que puede recomprar lo suyo).
 */
export function exploredTokens(runId: number, missionId: number): Array<{ mint: string; symbol: string }> {
  return db
    .prepare(
      `SELECT DISTINCT p.asset AS mint, p.symbol FROM positions p JOIN missions m ON m.id = p.mission_id
       WHERE m.lab_run_id IS NOT NULL AND (m.lab_run_id < ? OR (m.lab_run_id = ? AND m.id != ?)) AND p.venue = 'solana'
         AND p.asset NOT IN ('So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')`,
    )
    .all(runId, runId, missionId) as Array<{ mint: string; symbol: string }>;
}

/** Detiene todas las misiones activas de una tanda (por defecto, la que esté en curso). */
export async function stopLabRun(closePositions: boolean, runId?: number) {
  const id = runId ?? activeLabRun()?.id;
  if (id === undefined) throw new Error("No hay ninguna tanda del laboratorio en curso");
  const missions = db.prepare("SELECT id FROM missions WHERE lab_run_id = ? AND status = 'active'").all(id) as Array<{ id: number }>;
  const results = await Promise.all(missions.map((m) => stopMission(closePositions, m.id).catch((err) => ({ missionId: m.id, error: (err as Error).message }))));
  closeFinishedLabRuns();
  return { runId: id, stopped: results };
}

/** Clasificación de una tanda del laboratorio (por defecto, la última). */
export async function labRunStatus(runId?: number) {
  const run = (
    runId !== undefined
      ? db.prepare("SELECT * FROM lab_runs WHERE id = ?").get(runId)
      : db.prepare("SELECT * FROM lab_runs ORDER BY id DESC LIMIT 1").get()
  ) as
    | { id: number; created_at: string; capital_usd: number; target_usd: number; duration_minutes: number; instructions: string | null; status: string }
    | undefined;
  if (!run) return null;
  const missions = db.prepare("SELECT * FROM missions WHERE lab_run_id = ? ORDER BY id").all(run.id) as unknown as Mission[];
  const rows = await Promise.all(
    missions.map(async (m) => {
      const value = m.status === "active" ? (await valuation(m.id)).totalUsd : (m.final_usd ?? (await valuation(m.id)).totalUsd);
      return {
        missionId: m.id,
        label: m.lab_label,
        group: m.lab_group,
        status: m.status,
        valueUsd: Number(value.toFixed(2)),
        resultPct: Number((((value - m.initial_usd) / m.initial_usd) * 100).toFixed(2)),
      };
    }),
  );
  rows.sort((a, b) => b.valueUsd - a.valueUsd);
  return { run, leaderboard: rows };
}
