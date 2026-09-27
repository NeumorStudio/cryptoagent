// Misión: capital inicial ficticio, objetivo y plazo real. Termina sola cuando la cartera
// llega al objetivo o se acaba el tiempo; entonces se cierran todas las posiciones a mercado.
import { db, logJournal, now } from "../db.js";
import { liquidateAll, resetPortfolio, valuation } from "./portfolio.js";

export interface Mission {
  id: number;
  created_at: string;
  initial_usd: number;
  target_usd: number;
  deadline: string;
  status: "active" | "succeeded" | "expired" | "cancelled";
  ended_at: string | null;
  final_usd: number | null;
  instructions: string | null;
}

export function getActiveMission(): Mission | undefined {
  return db.prepare("SELECT * FROM missions WHERE status = 'active' ORDER BY id DESC LIMIT 1").get() as Mission | undefined;
}

export function getLastMission(): Mission | undefined {
  return db.prepare("SELECT * FROM missions ORDER BY id DESC LIMIT 1").get() as Mission | undefined;
}

/** Historial objetivo de misiones terminadas (lo calcula el simulador, no el agente). */
export function missionHistory() {
  const rows = db
    .prepare(
      `SELECT m.*, (SELECT COUNT(*) FROM lessons l WHERE l.mission_id = m.id) AS lessons
       FROM missions m WHERE m.status NOT IN ('active', 'closing') ORDER BY m.id`,
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

export async function createMission(initialUsd: number, targetUsd: number, durationMinutes: number, instructions?: string): Promise<Mission> {
  if (!(targetUsd > initialUsd)) throw new Error("El objetivo debe ser mayor que el capital inicial");
  if (!(durationMinutes > 0)) throw new Error("La duración debe ser positiva");

  const previous = getActiveMission();
  if (previous) {
    db.prepare("UPDATE missions SET status = 'cancelled', ended_at = ? WHERE id = ?").run(now(), previous.id);
    logJournal({ sessionId: null, kind: "mission", summary: `Misión #${previous.id} cancelada por el usuario al crear una nueva` });
  }
  // Cada misión empieza de cero: cartera nueva, sin órdenes y sin notas (las notas son la memoria
  // del agente dentro de una misión; si pasaran a la siguiente, arrastrarían decisiones de otra).
  // El diario se conserva como historial.
  db.prepare("UPDATE orders SET status = 'cancelled', closed_at = ? WHERE status = 'open'").run(now());
  db.exec("DELETE FROM notes");
  await resetPortfolio(initialUsd);

  const deadline = new Date(Date.now() + durationMinutes * 60_000).toISOString();
  const id = Number(
    db
      .prepare("INSERT INTO missions (created_at, initial_usd, target_usd, deadline, instructions) VALUES (?, ?, ?, ?, ?)")
      .run(now(), initialUsd, targetUsd, deadline, instructions?.trim() || null)
      .lastInsertRowid,
  );
  logJournal({
    sessionId: null,
    kind: "mission",
    summary: `Misión #${id} iniciada: de ${initialUsd} USD a ${targetUsd} USD antes del ${new Date(deadline).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}`,
  });
  return getActiveMission()!;
}

function remaining(deadline: string) {
  const ms = new Date(deadline).getTime() - Date.now();
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  return { ms, text: `${Math.floor(totalMin / 60)} h ${totalMin % 60} min` };
}

export async function missionStatus() {
  const mission = getActiveMission() ?? getLastMission();
  if (!mission) return { active: false, message: "No hay ninguna misión. El usuario debe crear una con /trading en Claude Code (o `npm run mission`)." };
  if (mission.status !== "active") {
    return {
      active: false,
      message: `La misión #${mission.id} ha terminado (${mission.status}). No se puede operar hasta que el usuario cree una nueva.`,
      mission,
    };
  }
  const v = await valuation();
  const left = remaining(mission.deadline);
  return {
    active: true,
    missionId: mission.id,
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
 * Detiene la misión activa por decisión del usuario. Con closePositions, cierra todas las
 * posiciones a mercado (igual que al terminar); si no, la cartera queda tal cual.
 */
export async function stopMission(closePositions: boolean): Promise<{ missionId: number; finalUsd: number; problems: string[] }> {
  const mission = getActiveMission();
  if (!mission) throw new Error("No hay ninguna misión activa");
  if (!db.prepare("UPDATE missions SET status = 'closing' WHERE id = ? AND status = 'active'").run(mission.id).changes) {
    throw new Error("La misión se está cerrando en este momento");
  }
  db.prepare("UPDATE orders SET status = 'cancelled', closed_at = ? WHERE status = 'open'").run(now());
  const problems = closePositions ? await liquidateAll(null, `Cierre manual: el usuario detuvo la misión #${mission.id}`) : [];
  const final = await valuation(true);
  db.prepare("UPDATE missions SET status = 'cancelled', ended_at = ?, final_usd = ? WHERE id = ?").run(now(), final.totalUsd, mission.id);
  logJournal({
    sessionId: null,
    kind: "mission",
    summary:
      `Misión #${mission.id} detenida por el usuario ${closePositions ? "cerrando posiciones" : "sin cerrar posiciones"}: ` +
      `${mission.initial_usd} → ${final.totalUsd.toFixed(2)} USD (objetivo ${mission.target_usd} USD)`,
    details: { problems },
  });
  return { missionId: mission.id, finalUsd: final.totalUsd, problems };
}

let checking = false;

/**
 * Comprueba si la misión activa ha terminado (objetivo alcanzado o plazo vencido) y,
 * si es así, cierra todas las posiciones y la da por terminada. Devuelve líneas de log.
 */
export async function checkMission(): Promise<string[]> {
  if (checking) return [];
  checking = true;
  try {
    const mission = getActiveMission();
    if (!mission) return [];
    const expired = remaining(mission.deadline).ms <= 0;
    const value = (await valuation()).totalUsd;
    const reached = value >= mission.target_usd;
    if (!expired && !reached) return [];

    // Reclamo atómico: solo un proceso cierra la misión.
    const status = reached ? "succeeded" : "expired";
    if (!db.prepare("UPDATE missions SET status = 'closing' WHERE id = ? AND status = 'active'").run(mission.id).changes) return [];

    const reason = reached
      ? `Cierre automático: objetivo de la misión #${mission.id} alcanzado (${value.toFixed(2)} ≥ ${mission.target_usd} USD)`
      : `Cierre automático: se acabó el plazo de la misión #${mission.id}`;
    db.prepare("UPDATE orders SET status = 'cancelled', closed_at = ? WHERE status = 'open'").run(now());
    const problems = await liquidateAll(null, reason);
    const final = await valuation(true);

    // El objetivo se detecta con el valor de liquidación estimado, pero lo que cuenta es lo
    // realizado al vender. Si al cerrar se queda corto y aún hay tiempo, la misión continúa.
    if (reached && !expired && final.totalUsd < mission.target_usd) {
      db.prepare("UPDATE missions SET status = 'active' WHERE id = ?").run(mission.id);
      const summary =
        `Misión #${mission.id}: al cerrar posiciones el resultado realizado (${final.totalUsd.toFixed(2)} USD) quedó por debajo ` +
        `del objetivo (${mission.target_usd} USD) por comisiones y slippage. La misión continúa.`;
      logJournal({ sessionId: null, kind: "mission", summary, details: { problems } });
      return [summary];
    }

    db.prepare("UPDATE missions SET status = ?, ended_at = ?, final_usd = ? WHERE id = ?").run(status, now(), final.totalUsd, mission.id);
    const summary =
      `Misión #${mission.id} ${reached ? "CONSEGUIDA" : "TERMINADA POR TIEMPO"}: ${mission.initial_usd} → ${final.totalUsd.toFixed(2)} USD ` +
      `(objetivo ${mission.target_usd} USD)`;
    logJournal({ sessionId: null, kind: "mission", summary, details: { problems } });
    return [summary, ...problems.map((p) => `No se pudo liquidar: ${p}`)];
  } finally {
    checking = false;
  }
}
