// Misión: capital inicial ficticio, objetivo y plazo real. Termina sola cuando la cartera
// llega al objetivo o se acaba el tiempo; entonces se cierran todas las posiciones a mercado.
// Cada misión tiene su propia cartera, órdenes, diario y posiciones.
import { db, logJournal, now } from "../db.js";
import { liquidateAll, planPortfolio, resetPortfolio, validateAllocation, valuation } from "./portfolio.js";
import { DEFAULT_ALLOCATION, type Allocation, type ChainId, type Holding } from "./types.js";
import { settleTransfers } from "./transfers.js";
import { getVenue } from "./venues/index.js";

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
  benchmark_sol_price: number | null;
  /** Reparto inicial por cadena o exchange (JSON de porcentajes). */
  allocation: string | null;
  /** Cartera inicial (JSON de saldos): la referencia "sin operar". */
  benchmark: string | null;
  /** Cuándo empezó a trabajar el agente (y arrancó el reloj); null mientras se prepara. */
  started_at: string | null;
}

export function getMission(id: number): Mission | undefined {
  return db.prepare("SELECT * FROM missions WHERE id = ?").get(id) as Mission | undefined;
}

/** Misión activa. */
export function getActiveMission(): Mission | undefined {
  return db.prepare("SELECT * FROM missions WHERE status = 'active' ORDER BY id DESC LIMIT 1").get() as
    | Mission
    | undefined;
}

/** Última misión, activa o no. */
export function getLastMission(): Mission | undefined {
  return db.prepare("SELECT * FROM missions ORDER BY id DESC LIMIT 1").get() as Mission | undefined;
}

/** Misiones activas (normalmente una). */
export function activeMissions(): Mission[] {
  return db.prepare("SELECT * FROM missions WHERE status = 'active' ORDER BY id").all() as unknown as Mission[];
}

/** Historial objetivo de misiones terminadas (lo calcula el simulador, no el agente). */
export function missionHistory() {
  const rows = db
    .prepare(
      `SELECT m.*, (SELECT r.origin FROM mission_reviews r WHERE r.mission_id = m.id) AS review_origin
       FROM missions m WHERE m.status NOT IN ('active', 'closing') ORDER BY m.id`,
    )
    .all() as unknown as Array<Mission & { review_origin: string | null }>;
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
      reviewed: m.review_origin !== null || m.reviewed_at !== null,
    };
  });
}

function insertMission(args: {
  initialUsd: number;
  targetUsd: number;
  durationMinutes: number;
  instructions?: string;
  allocation: Allocation;
  holdings: Holding[];
}): number {
  const deadline = new Date(Date.now() + args.durationMinutes * 60_000).toISOString();
  const id = Number(
    db
      .prepare("INSERT INTO missions (created_at, initial_usd, target_usd, deadline, instructions, allocation, benchmark) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(now(), args.initialUsd, args.targetUsd, deadline, args.instructions?.trim() || null, JSON.stringify(args.allocation), JSON.stringify(args.holdings))
      .lastInsertRowid,
  );
  resetPortfolio(id, args.holdings);
  logJournal({
    missionId: id,
    sessionId: null,
    kind: "mission",
    summary:
      `Misión #${id} iniciada: de ${args.initialUsd} USD a ${args.targetUsd} USD ` +
      `antes del ${new Date(deadline).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}`,
  });
  return id;
}

function validate(initialUsd: number, targetUsd: number, durationMinutes: number) {
  if (!(targetUsd > initialUsd)) throw new Error("El objetivo debe ser mayor que el capital inicial");
  if (!(durationMinutes > 0)) throw new Error("La duración debe ser positiva");
}

/** Crea una misión (cancela la anterior si seguía activa). */
export async function createMission(
  initialUsd: number,
  targetUsd: number,
  durationMinutes: number,
  instructions?: string,
  allocation: Allocation = DEFAULT_ALLOCATION,
): Promise<Mission> {
  validate(initialUsd, targetUsd, durationMinutes);
  const plan = validateAllocation(allocation);
  // Precio de los nativos de las cadenas con capital, para entregar la parte de gas.
  const prices: Partial<Record<ChainId, number>> = {};
  for (const venue of Object.keys(plan)) {
    const v = getVenue(venue);
    if (v.kind !== "chain") continue;
    const price = (await v.priceUsd([v.native.address]))[v.native.address];
    if (!price) throw new Error(`No se pudo obtener el precio de ${v.native.symbol}`);
    prices[v.id] = price;
  }
  const holdings = planPortfolio(initialUsd, plan, prices);
  const previous = getActiveMission();
  if (previous) {
    db.prepare("UPDATE missions SET status = 'cancelled', ended_at = ? WHERE id = ?").run(now(), previous.id);
    db.prepare("UPDATE orders SET status = 'cancelled', closed_at = ? WHERE status = 'open' AND mission_id = ?").run(now(), previous.id);
    logJournal({ missionId: previous.id, sessionId: null, kind: "mission", summary: `Misión #${previous.id} cancelada por el usuario al crear una nueva` });
  }
  // Cada misión tiene su propia cartera, órdenes y notas: empieza de cero sin arrastrar nada de la anterior.
  return getMission(insertMission({ initialUsd, targetUsd, durationMinutes, instructions, allocation: plan, holdings }))!;
}

function remaining(deadline: string) {
  const ms = new Date(deadline).getTime() - Date.now();
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600), m = Math.floor(totalSec / 60) % 60, s = totalSec % 60;
  return { ms, seconds: totalSec, text: h ? `${h} h ${m} min` : `${m} min ${s} s` };
}

/**
 * El reloj de la misión arranca cuando el agente empieza a trabajar, no al crearla: así no se pierde
 * el tiempo que tarda en prepararse (el briefing del revisor, arrancar el agente). Solo la primera vez.
 */
export function startMissionClock(missionId: number | null) {
  if (missionId === null) return;
  const m = getMission(missionId);
  if (!m || m.status !== "active" || m.started_at) return;
  const durationMs = new Date(m.deadline).getTime() - new Date(m.created_at).getTime();
  const start = new Date();
  const changed = db
    .prepare("UPDATE missions SET started_at = ?, created_at = ?, deadline = ? WHERE id = ? AND started_at IS NULL AND status = 'active'")
    .run(start.toISOString(), start.toISOString(), new Date(start.getTime() + durationMs).toISOString(), missionId).changes;
  if (changed) logJournal({ missionId, sessionId: null, kind: "mission", summary: `El agente empieza a trabajar: el reloj de la misión #${missionId} arranca ahora` });
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
    initialUsd: mission.initial_usd,
    targetUsd: mission.target_usd,
    currentUsd: Number(v.totalUsd.toFixed(2)),
    missingUsd: Number((mission.target_usd - v.totalUsd).toFixed(2)),
    progressPct: Number((((v.totalUsd - mission.initial_usd) / (mission.target_usd - mission.initial_usd)) * 100).toFixed(1)),
    now: new Date().toISOString(),
    deadline: mission.deadline,
    timeLeft: left.text,
    secondsLeft: left.seconds,
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
  // Lo que está en tránsito llega: la cartera final lo incluye.
  await settleTransfers({ missionId: mission.id, force: true });
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
  await settleTransfers({ missionId: mission.id, force: true });
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
  return [summary, ...problems.map((p) => `No se pudo liquidar: ${p}`)];
}

const checking = new Set<number>();

/**
 * Comprueba las misiones activas y cierra las que
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
