// Misión: capital inicial ficticio, objetivo y plazo real. Termina sola cuando la cartera
// llega al objetivo o se acaba el tiempo; entonces se cierran todas las posiciones a mercado.
// Cada misión tiene su propia cartera, órdenes, diario y posiciones.
import { db, logJournal, now } from "../db.js";
import { adjust, CloseAborted, liquidateAll, planPortfolio, resetPortfolio, validateAllocation, valuation } from "./portfolio.js";
import { DEFAULT_ALLOCATION, type Allocation, type ChainId, type Holding, type VenueId } from "./types.js";
import { settleTransfers } from "./transfers.js";
import { allChains, getVenue } from "./venues/index.js";

export interface Mission {
  id: number;
  created_at: string;
  initial_usd: number;
  target_usd: number;
  deadline: string;
  status: "active" | "closing" | "succeeded" | "expired" | "bust" | "cancelled";
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
  /** 'sim' (dinero ficticio) o 'live' (la cartera real de la IA). */
  mode: "sim" | "live";
  /** Solo live: 'manual' (el usuario aprueba cada operación) o 'auto' (dentro de los límites). */
  approval: "manual" | "auto" | null;
  /** Solo live: JSON de MissionLimits. */
  limits: string | null;
  /**
   * 1: al tocar el objetivo se vende todo y la misión se da por conseguida. 0: dura hasta el plazo y se da por
   * conseguida si al final (vendido todo) vale el objetivo o más; qué hacer al llegar antes lo decide el agente.
   */
  close_on_target: number;
  /** 1: misión sin objetivo (máximo rendimiento en el plazo). target_usd guarda entonces el capital inicial. */
  open_target: number;
  /** 1: misión de control, sin memoria (como si fuera la primera): para medir si la memoria hace que juegue mejor. */
  memory_off: number;
  /** 1: misión continua sin límite de tiempo (no expira por plazo). */
  continuous?: number;
}

export interface MissionLimits {
  /** Máximo en USD por operación. */
  maxTradeUsd: number;
  /** Pérdida máxima de la misión en %: por debajo, solo se permite vender a estables. */
  maxLossPct: number;
}

export const isLive = (m: Pick<Mission, "mode"> | undefined | null) => m?.mode === "live";

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
      targetUsd: m.open_target ? null : m.target_usd,
      targetPct: m.open_target ? null : Number((((m.target_usd - m.initial_usd) / m.initial_usd) * 100).toFixed(1)),
      ...(m.open_target ? { goal: "sin objetivo: el máximo rendimiento posible en el plazo" } : {}),
      durationMinutes: minutes,
      userInstructions: m.instructions ?? "ninguna (modo libre)",
      finalUsd: m.final_usd === null ? null : Number(m.final_usd.toFixed(2)),
      resultPct: m.final_usd === null ? null : Number((((m.final_usd - m.initial_usd) / m.initial_usd) * 100).toFixed(2)),
      outcome: outcomeLabel(m),
      reviewed: m.review_origin !== null || m.reviewed_at !== null,
    };
  });
}

/** Cómo terminó una misión, en palabras. Una misión sin objetivo termina por tiempo y se mide por su rendimiento. */
/** El objetivo, en palabras (para el diario). */
export const targetText = (m: Pick<Mission, "open_target" | "target_usd">) => (m.open_target ? "sin objetivo" : `objetivo ${m.target_usd} USD`);

export function outcomeLabel(m: Pick<Mission, "status" | "open_target">): string {
  if (m.status === "bust") return "sin fondos (bancarrota)";
  if (m.status === "cancelled") return "cancelada";
  if (m.open_target) return "sin objetivo: terminó por tiempo (cuenta el rendimiento)";
  return m.status === "succeeded" ? "objetivo conseguido" : m.status === "expired" ? "no llegó al objetivo" : m.status;
}

function insertMission(args: {
  initialUsd: number;
  /** null: misión sin objetivo (máximo rendimiento en el plazo). */
  targetUsd: number | null;
  durationMinutes: number;
  instructions?: string;
  allocation: Allocation;
  holdings: Holding[];
  live?: { approval: "manual" | "auto"; limits: MissionLimits };
  closeOnTarget?: boolean;
  memoryOff?: boolean;
  continuous?: boolean;
}): number {
  const isContinuous = !!args.continuous;
  const deadline = isContinuous
    ? new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString()
    : new Date(Date.now() + args.durationMinutes * 60_000).toISOString();
  const id = Number(
    db
      .prepare(
        "INSERT INTO missions (created_at, initial_usd, target_usd, deadline, instructions, allocation, benchmark, mode, approval, limits, close_on_target, open_target, memory_off, continuous) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        now(),
        args.initialUsd,
        args.targetUsd ?? args.initialUsd,
        deadline,
        args.instructions?.trim() || null,
        JSON.stringify(args.allocation),
        JSON.stringify(args.holdings),
        args.live ? "live" : "sim",
        args.live?.approval ?? null,
        args.live ? JSON.stringify(args.live.limits) : null,
        args.closeOnTarget === false || args.targetUsd === null ? 0 : 1,
        args.targetUsd === null ? 1 : 0,
        args.memoryOff ? 1 : 0,
        isContinuous ? 1 : 0,
      ).lastInsertRowid,
  );
  // En una misión real, los saldos son los de la cadena (holdings es su espejo).
  resetPortfolio(id, args.holdings);
  logJournal({
    missionId: id,
    sessionId: null,
    kind: "mission",
    summary:
      `${args.live ? "Misión REAL" : "Misión"} #${id} iniciada: ${args.targetUsd === null ? `${args.initialUsd.toFixed(2)} USD, sin objetivo (máximo rendimiento)` : `de ${args.initialUsd.toFixed(2)} USD a ${args.targetUsd.toFixed(2)} USD`} ` +
      (isContinuous
        ? "en modo continuo (sin límite de tiempo)"
        : `en ${Math.round((new Date(deadline).getTime() - Date.now()) / 60_000)} min (el reloj arranca cuando el agente empieza a trabajar)`) +
      (args.memoryOff ? ". MISIÓN DE CONTROL: el agente juega sin memoria, para medir si la memoria le ayuda" : ""),
  });
  return id;
}

/**
 * Misiones de control: cada CONTROL_EVERY misiones simuladas, una se juega sin memoria. Comparar su resultado con el de
 * las misiones con memoria dice si lo aprendido le hace jugar mejor (y cuándo más tandas ya no enseñan nada).
 */
export const CONTROL_EVERY = 10;
function controlMission(memory: "auto" | "on" | "off" = "auto"): boolean {
  if (memory !== "auto") return memory === "off";
  const n = (db.prepare("SELECT COUNT(*) AS n FROM missions WHERE mode = 'sim'").get() as { n: number }).n + 1;
  return n % CONTROL_EVERY === 0;
}

/** Si la misión es de control (sin memoria). */
export function isMemoryOff(missionId: number | null | undefined): boolean {
  if (missionId === null || missionId === undefined) return false;
  return (db.prepare("SELECT memory_off FROM missions WHERE id = ?").get(missionId) as { memory_off: number } | undefined)?.memory_off === 1;
}

function validate(initialUsd: number, targetUsd: number | null, durationMinutes: number, continuous = false) {
  if (targetUsd !== null && !(targetUsd > initialUsd)) throw new Error("El objetivo debe ser mayor que el capital inicial");
  if (!continuous && !(durationMinutes > 0)) throw new Error("La duración debe ser positiva");
}

/** Crea una misión (cancela la anterior si seguía activa). */
export async function createMission(
  initialUsd: number,
  /** null: sin objetivo (máximo rendimiento en el plazo; no se cierra al llegar a nada). */
  targetUsd: number | null,
  durationMinutes: number,
  instructions?: string,
  allocation: Allocation = DEFAULT_ALLOCATION,
  opts: { closeOnTarget?: boolean; memory?: "auto" | "on" | "off"; continuous?: boolean } = {},
): Promise<Mission> {
  const isContinuous = !!opts.continuous;
  const minutes = isContinuous ? (durationMinutes > 0 ? durationMinutes : 525600) : durationMinutes;
  validate(initialUsd, targetUsd, minutes, isContinuous);
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
  cancelActive();
  // Cada misión tiene su propia cartera, órdenes y notas: empieza de cero sin arrastrar nada de la anterior.
  return getMission(
    insertMission({ initialUsd, targetUsd, durationMinutes: minutes, instructions, allocation: plan, holdings, closeOnTarget: opts.closeOnTarget, memoryOff: controlMission(opts.memory), continuous: isContinuous }),
  )!;
}

function cancelActive() {
  const previous = getActiveMission();
  if (!previous) return;
  db.prepare("UPDATE missions SET status = 'cancelled', ended_at = ? WHERE id = ?").run(now(), previous.id);
  db.prepare("UPDATE orders SET status = 'cancelled', closed_at = ? WHERE status = 'open' AND mission_id = ?").run(now(), previous.id);
  logJournal({ missionId: previous.id, sessionId: null, kind: "mission", summary: `Misión #${previous.id} cancelada por el usuario al crear una nueva` });
}

/**
 * Inyecta capital adicional en una misión activa (por ejemplo, para continuar aprendiendo en simulación
 * sin reiniciar la misión ni empezar de cero).
 */
export async function injectCapital(
  missionId: number,
  amountUsd: number,
  allocation?: Allocation,
): Promise<{ missionId: number; injectedUsd: number; newInitialUsd: number; addedHoldings: Holding[] }> {
  const mission = getMission(missionId);
  if (!mission || mission.status !== "active") throw new Error("No hay ninguna misión activa para inyectar capital");
  if (!(amountUsd > 0)) throw new Error("El importe a inyectar debe ser mayor que 0");

  const plan = validateAllocation(allocation ?? (mission.allocation ? JSON.parse(mission.allocation) : DEFAULT_ALLOCATION));
  const prices: Partial<Record<ChainId, number>> = {};
  for (const venue of Object.keys(plan)) {
    const v = getVenue(venue);
    if (v.kind !== "chain") continue;
    const price = (await v.priceUsd([v.native.address]))[v.native.address];
    if (price) prices[v.id] = price;
  }
  const addedHoldings = planPortfolio(amountUsd, plan, prices);
  for (const h of addedHoldings) {
    adjust(missionId, h.venue as VenueId, h.asset, h.symbol, h.decimals, h.amount);
  }
  db.prepare("UPDATE missions SET initial_usd = initial_usd + ? WHERE id = ?").run(amountUsd, missionId);
  logJournal({
    missionId,
    sessionId: null,
    kind: "mission",
    summary: `Inyección de capital: +${amountUsd.toFixed(2)} USD añadidos para continuar operando en simulación (nuevo capital base: ${(mission.initial_usd + amountUsd).toFixed(2)} USD)`,
  });
  return {
    missionId,
    injectedUsd: amountUsd,
    newInitialUsd: mission.initial_usd + amountUsd,
    addedHoldings,
  };
}

/**
 * Misión con la cartera real de la IA. El capital inicial es lo que vale la cartera ahora (a precio de
 * liquidación) y los saldos son los de la cadena. `holdings` y `totalUsd` los lee quien llama (src/live).
 */
export function createLiveMission(args: {
  holdings: Holding[];
  totalUsd: number;
  byChain: Record<ChainId, number>;
  /** null: sin objetivo (el máximo rendimiento en el plazo). */
  targetPct: number | null;
  durationMinutes: number;
  instructions?: string;
  approval: "manual" | "auto";
  limits: MissionLimits;
}): Mission {
  if (!(args.totalUsd >= 1)) throw new Error(`La cartera real vale ${args.totalUsd.toFixed(2)} USD: envíale fondos antes de empezar`);
  if (args.targetPct !== null && !(args.targetPct > 0)) throw new Error("El objetivo debe ser una subida positiva");
  if (!(args.limits.maxTradeUsd > 0) || !(args.limits.maxLossPct > 0 && args.limits.maxLossPct <= 100)) throw new Error("Límites no válidos");
  const targetUsd = args.targetPct === null ? null : Number((args.totalUsd * (1 + args.targetPct / 100)).toFixed(2));
  validate(args.totalUsd, targetUsd, args.durationMinutes);
  const allocation = Object.fromEntries(
    Object.entries(args.byChain)
      .filter(([, v]) => v > 0)
      .map(([c, v]) => [c, Number(((v / args.totalUsd) * 100).toFixed(1))]),
  ) as Allocation;
  cancelActive();
  return getMission(
    insertMission({
      initialUsd: args.totalUsd,
      targetUsd,
      durationMinutes: args.durationMinutes,
      instructions: args.instructions,
      allocation,
      holdings: args.holdings,
      live: { approval: args.approval, limits: args.limits },
    }),
  )!;
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
  if (!mission) return { active: false, message: "No hay ninguna misión. El usuario debe crear una (/cryptoagent:trading en Claude Code, /cryptoagent-trading en OpenCode)." };
  if (mission.status !== "active") {
    return {
      active: false,
      message: `La misión #${mission.id} ha terminado (${mission.status}). No se puede operar hasta que el usuario cree una nueva.`,
      mission: {
        id: mission.id,
        status: mission.status,
        mode: mission.mode,
        initialUsd: mission.initial_usd,
        targetUsd: mission.open_target ? null : mission.target_usd,
        finalUsd: mission.final_usd,
        deadline: mission.deadline,
        endedAt: mission.ended_at,
        instructions: mission.instructions,
      },
    };
  }
  const v = await valuation(mission.id);
  const isContinuous = mission.continuous === 1;
  const left = remaining(mission.deadline);
  const idle = isContinuous ? undefined : idleCheck(mission, v, left.seconds);
  return {
    ...(idle ? { idle } : {}),
    active: true,
    missionId: mission.id,
    initialUsd: mission.initial_usd,
    ...(isContinuous ? { continuous: true } : {}),
    ...(mission.memory_off
      ? { control: "Misión de control: juegas sin memoria (sin creencias, howtos, briefing ni historial), como si fuera la primera. Sirve para medir si tu memoria te ayuda: juega lo mejor que sepas con lo que veas." }
      : {}),
    ...(mission.open_target
      ? { goal: isContinuous ? "MODO CONTINUO: sin plazo forzoso ni meta rígida. Gestiona la cartera para conseguir beneficios sostenidos y mantener ganancias protegidas en USDC." : "SIN OBJETIVO: el usuario quiere el máximo rendimiento posible al final del plazo. No hay una meta que alcanzar ni cierre al llegar a nada: cuenta lo que valga la cartera al acabar." }
      : {
          targetUsd: mission.target_usd,
          missingUsd: Number((mission.target_usd - v.totalUsd).toFixed(2)),
          progressPct: Number((((v.totalUsd - mission.initial_usd) / (mission.target_usd - mission.initial_usd)) * 100).toFixed(1)),
        }),
    currentUsd: Number(v.totalUsd.toFixed(2)),
    currentUsdNote: "Valor de liquidación con cotizaciones de hasta 10 s: en tokens que se mueven rápido, vender puede dar algo distinto.",
    now: new Date().toISOString(),
    deadline: isContinuous ? "sin plazo fijo (modo continuo)" : mission.deadline,
    timeLeft: isContinuous ? "indefinido (modo continuo)" : left.text,
    secondsLeft: isContinuous ? null : left.seconds,
    resultPct: Number((((v.totalUsd - mission.initial_usd) / mission.initial_usd) * 100).toFixed(1)),
    closesOnTarget: isContinuous
      ? "modo continuo: no se cierra automáticamente al objetivo ni por plazo. El agente opera y gestiona beneficios."
      : mission.open_target
        ? "no hay objetivo: la misión dura hasta el plazo y al final se vende todo"
        : mission.close_on_target !== 0
          ? "sí: al llegar al objetivo se vende todo y la misión termina conseguida"
          : "no: la misión dura hasta el plazo. Al final se vende todo y cuenta como conseguida si vale el objetivo o más. Llegar antes no la termina: qué hacer entonces lo decides tú",
    userInstructions: mission.instructions ?? "ninguna: modo libre",
    ...(isLive(mission)
      ? {
          mode: "REAL: dinero de verdad de la cartera de la IA",
          approval: mission.approval === "manual" ? "el usuario aprueba cada operación (puede tardar hasta ~90 s)" : "autónoma dentro de los límites",
          limits: JSON.parse(mission.limits ?? "{}") as MissionLimits,
          stopsBelowUsd: Number(lossFloor(mission)!.toFixed(2)),
          stopNote: "Si la cartera baja de stopsBelowUsd, la misión se para sola: se venden los tokens a estables y termina.",
          howToTrade: "execute_swap para los swaps y execute_bridge para mover estables o el nativo entre cadenas (simulate_*, Binance y simulate_transfer no están disponibles en una misión real)",
        }
      : { mode: "simulada" }),
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
      `${mission.initial_usd} → ${final.totalUsd.toFixed(2)} USD (${targetText(mission)})`,
    details: { problems },
  });
  return { missionId: mission.id, finalUsd: final.totalUsd, problems };
}

/** Minutos desde la última operación (o desde que empezó la misión). */
export function minutesSinceLastTrade(mission: Mission): number {
  const last = (
    db.prepare("SELECT MAX(ts) AS ts FROM journal WHERE mission_id = ? AND kind IN ('swap', 'cex_order', 'transfer', 'perp') AND (reasoning IS NULL OR reasoning NOT LIKE 'Cierre %') AND (reasoning IS NULL OR reasoning NOT LIKE 'Parada %')").get(mission.id) as { ts: string | null }
  ).ts;
  return (Date.now() - new Date(last ?? mission.started_at ?? mission.created_at).getTime()) / 60_000;
}

/**
 * Dato de "parado": lejos del objetivo, con casi todo en efectivo (estables o el nativo) y sin operar desde hace un
 * rato, con minutos útiles por delante. Es un dato, no una orden: hasta la v0.41 decía "quedarte quieto es el peor
 * resultado, entra en el mejor que haya" y acortaba la espera, y en la M22 (prueba real con "pierde lo mínimo") empujaba
 * a operar contra las instrucciones del usuario. Qué hacer con él lo decide el agente.
 */
export function idleCheck(mission: Mission, v: Awaited<ReturnType<typeof valuation>>, secondsLeft: number): string | null {
  if (mission.status !== "active" || (!mission.open_target && v.totalUsd >= mission.target_usd) || secondsLeft < 90 || v.totalUsd <= 0) return null;
  const natives = new Set(allChains().map((c) => `${c.id}:${c.native.address}`));
  const cash = v.holdings.filter((h) => h.valuedBy === "stable" || natives.has(`${h.venue}:${h.asset}`)).reduce((s, h) => s + h.usd, 0);
  const cashPct = (cash / v.totalUsd) * 100;
  const durationMin = (new Date(mission.deadline).getTime() - new Date(mission.started_at ?? mission.created_at).getTime()) / 60_000;
  const idleMin = minutesSinceLastTrade(mission);
  if (cashPct < 80 || idleMin < Math.max(2, durationMin * 0.15)) return null;
  const needPct = ((mission.target_usd - v.totalUsd) / v.totalUsd) * 100;
  return (
    `Llevas ${Math.round(idleMin)} min sin operar, con el ${Math.round(cashPct)} % en efectivo; ` +
    (mission.open_target ? "" : `te falta un +${needPct.toFixed(0)} % y `) +
    `quedan ${Math.round(secondsLeft / 60)} min.` +
    (mission.mode === "live" ? "" : " En simulación, ese tiempo no te está dando datos de los que aprender.") +
    (mission.instructions ? " Las instrucciones del usuario mandan." : "")
  );
}

/**
 * Por debajo de este valor la cartera ya no puede operar de forma útil (comisiones, renta de cuentas,
 * mínimos): el 5 % del capital inicial, y nunca menos de 2 $. La misión termina "sin fondos".
 */
export function bustFloor(mission: Pick<Mission, "initial_usd">): number {
  return Math.max(2, mission.initial_usd * 0.05);
}

/** Valor por debajo del cual una misión real se para (pérdida máxima); null en simulación. */
export function lossFloor(mission: Mission): number | null {
  if (!isLive(mission) || !mission.limits) return null;
  const { maxLossPct } = JSON.parse(mission.limits) as MissionLimits;
  return mission.initial_usd * (1 - maxLossPct / 100);
}

/**
 * Curva de valor de la misión: una instantánea por minuto (solo con valoración fiable). Con ella se mide el pico, la
 * caída desde el pico y cuánto de lo ganado se devolvió: los datos para aprender a gestionar las ganancias.
 */
const EQUITY_POINT_MS = 60_000;
function recordEquityPoint(missionId: number, v: { totalUsd: number; benchmarkUsd?: number | null; reliable: boolean }) {
  if (!v.reliable || !(v.totalUsd > 0)) return;
  const last = (db.prepare("SELECT MAX(ts) AS ts FROM snapshots WHERE mission_id = ?").get(missionId) as { ts: string | null }).ts;
  if (last && Date.now() - new Date(last).getTime() < EQUITY_POINT_MS) return;
  db.prepare("INSERT INTO snapshots (ts, mission_id, total_usd, benchmark_usd, details) VALUES (?, ?, ?, ?, NULL)").run(
    now(),
    missionId,
    v.totalUsd,
    v.benchmarkUsd ?? v.totalUsd,
  );
}

/** Comprueba una misión y la cierra si ha llegado al objetivo o se le ha acabado el plazo. */
const lastSync = new Map<number, number>();

/** Misiones que el agente ha dado por terminadas: se cierran como si se hubiera acabado el plazo. */
const endedByAgent = new Set<number>();

async function checkOne(mission: Mission): Promise<string[]> {
  const isContinuous = mission.continuous === 1;
  const expired = (!isContinuous && remaining(mission.deadline).ms <= 0) || endedByAgent.has(mission.id);
  // Misión real: los saldos se leen de la cadena (como mucho cada 20 s por proceso).
  if (isLive(mission) && (expired || Date.now() - (lastSync.get(mission.id) ?? 0) > 20_000)) {
    const { syncHoldings } = await import("../live/sync.js");
    await syncHoldings(mission.id);
    lastSync.set(mission.id, Date.now());
  }
  const v = await valuation(mission.id);
  recordEquityPoint(mission.id, v);
  let value = v.totalUsd;
  // Con un valor de reserva (sin cotización real) no se da el objetivo por conseguido. En una misión que no se
  // cierra al tocarlo, el objetivo se comprueba solo al final, con lo realizado al venderlo todo.
  const closesOnTarget = mission.close_on_target !== 0;
  let reached = closesOnTarget && value >= mission.target_usd && v.reliable;
  // Antes de venderlo todo por haber llegado, se confirma con cotizaciones del momento: la valoración puede venir
  // de una cotización de hace unos segundos, y en un token que se mueve un 40 % por minuto ya no vale. En la M4 de
  // la v0.36.1 se dio por alcanzado con 57,46 $, la venta dio 47,46 y se llevó por delante la toma de beneficio.
  let fresh: Awaited<ReturnType<typeof valuation>> | null = null;
  if (reached && remaining(mission.deadline).ms > 0) {
    // En una misión real, antes se releen los saldos de la cadena: en la M21, tras cada puente, el saldo de origen
    // aún sin descontar más lo que estaba en tránsito hicieron creer cuatro veces que se había llegado al objetivo.
    if (isLive(mission)) {
      const { syncHoldings } = await import("../live/sync.js");
      await syncHoldings(mission.id);
      lastSync.set(mission.id, Date.now());
    }
    fresh = await valuation(mission.id, false, { fresh: true });
    value = fresh.totalUsd;
    reached = fresh.totalUsd >= mission.target_usd && fresh.reliable;
    if (!reached) return [];
  }
  // Misión real: al llegar a la pérdida máxima se para sola (se vende a estables y se cierra).
  const floor = lossFloor(mission);
  const lossHit = !reached && floor !== null && v.reliable && value < floor;
  // Sin fondos: lo que queda no da para operar (comisiones, renta de cuentas). La misión ha muerto (en continuas se mantiene activa para recapitalización).
  const bust = !isContinuous && !reached && v.reliable && value < bustFloor(mission);
  if (!expired && !reached && !lossHit && !bust) return [];

  // Reclamo atómico: solo un proceso cierra la misión.
  const status = reached ? "succeeded" : bust ? "bust" : "expired";
  if (!db.prepare("UPDATE missions SET status = 'closing' WHERE id = ? AND status = 'active'").run(mission.id).changes) return [];

  const reason = reached
    ? `Cierre automático: objetivo de la misión #${mission.id} alcanzado (${value.toFixed(2)} ≥ ${mission.target_usd} USD)`
    : bust
      ? `Parada automática: la misión #${mission.id} se ha quedado sin fondos para operar (${value.toFixed(2)} USD)`
      : lossHit
        ? `Parada automática: la misión #${mission.id} ha llegado a la pérdida máxima (${value.toFixed(2)} < ${floor!.toFixed(2)} USD)`
        : `Cierre automático: se acabó el plazo de la misión #${mission.id}`;
  await settleTransfers({ missionId: mission.id, force: true });
  // Con el objetivo tocado, el nativo se vende solo si al final se cierra: si lo realizado se queda corto y la
  // misión sigue, sin él no habría gas para volver a operar (en la M1 de la v0.35 se quedó sin SOL así).
  const keepNative = reached && !expired && !isLive(mission);
  // Cada token se vende como una orden límite: al menos lo que dio la cotización que confirmó el objetivo, menos
  // un 1 %. Si el precio se ha ido en el segundo que pasa hasta vender, no se cierra: la misión sigue con su
  // posición y sus órdenes (mientras se cierra, las órdenes no se ejecutan: solo corren en misiones activas).
  const quoted = new Map((fresh?.holdings ?? []).map((h) => [`${h.venue}:${h.asset}`, h.usd]));
  const minOut = keepNative && fresh ? (venue: string, asset: string) => {
    const usd = quoted.get(`${venue}:${asset}`);
    return usd && usd > 0 ? usd * 0.99 : undefined;
  } : undefined;
  let problems: string[];
  try {
    problems = await liquidateAll(mission.id, null, reason, { keepNative, minOut });
  } catch (err) {
    if (!(err instanceof CloseAborted)) throw err;
    db.prepare("UPDATE missions SET status = 'active' WHERE id = ?").run(mission.id);
    const summary = `Misión #${mission.id}: objetivo tocado (${value.toFixed(2)} USD), pero no se cierra: ${err.message}. El precio se ha movido; la misión continúa con sus posiciones y órdenes.`;
    logJournal({ missionId: mission.id, sessionId: null, kind: "mission", summary });
    return [summary];
  }
  db.prepare("UPDATE orders SET status = 'cancelled', closed_at = ? WHERE status = 'open' AND mission_id = ?").run(now(), mission.id);
  let final = await valuation(mission.id, true);

  // El objetivo se detecta con el valor de liquidación estimado, pero lo que cuenta es lo
  // realizado al vender: el efectivo en stablecoins. Si al cerrar se queda corto y aún hay tiempo,
  // la misión continúa y se reintenta. Lo que no se pudo vender (p. ej. un token sin ruta de venta,
  // que vale 0) no impide cerrarla si el efectivo ya llega al objetivo.
  // En una misión real, el nativo no se vende (paga la red de las siguientes): cuenta como realizado.
  const natives = new Set(allChains().map((c) => `${c.id}:${c.native.address}`));
  const realizedUsd = final.holdings
    .filter((h) => h.valuedBy === "stable" || ((isLive(mission) || keepNative) && natives.has(`${h.venue}:${h.asset}`)))
    .reduce((s, h) => s + h.usd, 0);
  const closes = !(reached && !expired && realizedUsd < mission.target_usd);
  if (keepNative && closes) {
    problems.push(...(await liquidateAll(mission.id, null, reason, { nativeOnly: true })));
    final = await valuation(mission.id, true);
  }
  if (!closes) {
    db.prepare("UPDATE missions SET status = 'active' WHERE id = ?").run(mission.id);
    const summary = problems.length
      ? `Misión #${mission.id}: objetivo alcanzado, pero no se pudo vender todo (${problems.join("; ")}). La misión continúa y se reintentará.`
      : `Misión #${mission.id}: al cerrar posiciones lo realizado (${realizedUsd.toFixed(2)} USD, de ${final.totalUsd.toFixed(2)} USD en total) quedó por debajo ` +
        `del objetivo (${mission.target_usd} USD) por comisiones y slippage. La misión continúa.`;
    logJournal({ missionId: mission.id, sessionId: null, kind: "mission", summary, details: { problems } });
    return [summary];
  }

  // Sin cierre al objetivo, al acabar el plazo cuenta lo que vale la cartera ya vendida.
  // Una misión sin objetivo no se "consigue": termina por tiempo y cuenta su rendimiento.
  const succeeded = !mission.open_target && (reached || (!closesOnTarget && expired && !bust && !lossHit && final.reliable && final.totalUsd >= mission.target_usd));
  const finalStatus = succeeded ? "succeeded" : status;
  db.prepare("UPDATE missions SET status = ?, ended_at = ?, final_usd = ? WHERE id = ?").run(finalStatus, now(), final.totalUsd, mission.id);
  // Cómo les fue a los candidatos que vio y no compró (para que aprenda también de lo que descarta).
  await import("./skipped.js").then(({ measureSkipped }) => measureSkipped(mission.id)).catch(() => undefined);
  const resultPct = ((final.totalUsd - mission.initial_usd) / mission.initial_usd) * 100;
  const summary =
    `Misión #${mission.id} ${succeeded ? "CONSEGUIDA" : bust ? "SIN FONDOS (bancarrota)" : lossHit ? "PARADA POR PÉRDIDA MÁXIMA" : "TERMINADA POR TIEMPO"}: ${mission.initial_usd.toFixed(2)} → ${final.totalUsd.toFixed(2)} USD ` +
    `(${resultPct >= 0 ? "+" : ""}${resultPct.toFixed(1)} %; ${targetText(mission)})`;
  logJournal({ missionId: mission.id, sessionId: null, kind: "mission", summary, details: { problems } });
  return [summary, ...problems.map((p) => `No se pudo liquidar: ${p}`)];
}

const checking = new Set<number>();

/**
 * Comprueba las misiones activas y cierra las que
 * hayan terminado. Devuelve líneas de log. Si se indica una misión, solo comprueba esa.
 */
/**
 * El agente da la misión por terminada antes del plazo (ya no va a operar más): se cierra ahora, igual que al acabarse el
 * tiempo (vende lo que quede, valora y mide lo descartado), y queda registrado con cuántos minutos le quedaban y por qué.
 * Antes solo cerraba su sesión y la misión seguía corriendo vacía hasta el plazo.
 */
export async function finishByAgent(missionId: number, reason: string): Promise<string[]> {
  const mission = getMission(missionId);
  if (!mission || mission.status !== "active") throw new Error("No hay ninguna misión activa que terminar");
  const minutesLeft = Math.max(0, Math.round(remaining(mission.deadline).ms / 60_000));
  logJournal({
    missionId,
    sessionId: null,
    kind: "mission",
    summary: `El agente da la misión #${missionId} por terminada con ${minutesLeft} min por delante: ${reason.slice(0, 300)}`,
    details: { endedByAgent: true, minutesLeft },
  });
  endedByAgent.add(missionId);
  try {
    return await checkMission(missionId);
  } finally {
    endedByAgent.delete(missionId);
  }
}

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
