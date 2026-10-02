// Memoria entre misiones, de tres tipos:
// - Procedimental (howtos): cómo se hace algo, qué falla y cómo evitarlo.
// - Creencias sobre el mercado (beliefs): su evidencia no la declara nadie; la calcula el simulador con
//   las posiciones reales (las que aplicaron la creencia y, si tiene condición, las que la cumplían).
// - Episódica: el diario de cada misión y su retrospectiva (mission_reviews).
//
// La escribe el agente revisor, no el que opera: así el agente no juzga sus propias decisiones.
// El que opera deja observaciones (report_observation) y el revisor decide qué pasa a la memoria.
import { db, logActivity, now } from "../db.js";
import { skippedCandidates } from "./skipped.js";
import { getActiveMission, getLastMission, getMission, type Mission, CONTROL_EVERY } from "./mission.js";
import { listPositions } from "./positions.js";
import { DUPLICATE_THRESHOLD, fingerprint, similarity } from "./text.js";
import { launchpadOf } from "./launchpads.js";

// ─── Parecido entre misiones ────────────────────────────────────────────────

interface Profile {
  durationMinutes: number;
  /** null: misión sin objetivo (máximo rendimiento en el plazo). */
  targetPct: number | null;
  directed: boolean;
}

function profile(m: Pick<Mission, "created_at" | "deadline" | "initial_usd" | "target_usd" | "instructions" | "open_target">): Profile {
  return {
    durationMinutes: Math.max(1, Math.round((new Date(m.deadline).getTime() - new Date(m.created_at).getTime()) / 60_000)),
    targetPct: m.open_target ? null : Number((((m.target_usd - m.initial_usd) / m.initial_usd) * 100).toFixed(1)),
    directed: !!m.instructions,
  };
}

/**
 * Distancia entre perfiles: plazo en escala logarítmica, objetivo en tramos de 10 puntos, enfoque libre/dirigido. Una
 * misión sin objetivo se parece a otra sin objetivo; frente a una con objetivo, cuenta como bastante distinta.
 */
function distance(a: Profile, b: Profile) {
  const target = a.targetPct === null || b.targetPct === null ? (a.targetPct === b.targetPct ? 0 : 1) : Math.abs(a.targetPct - b.targetPct) / 10;
  return Math.abs(Math.log(a.durationMinutes / b.durationMinutes)) + target + (a.directed === b.directed ? 0 : 0.5);
}

const similarityLabel = (d: number) => (d <= 0.6 ? "muy parecida" : d <= 1.5 ? "parecida" : "distinta");

const describe = (p: Profile) =>
  `${p.durationMinutes} min, ${p.targetPct === null ? "sin objetivo (máximo rendimiento)" : `objetivo +${p.targetPct} %`}, ${p.directed ? "con instrucciones" : "modo libre"}`;

// ─── Condiciones de las creencias ───────────────────────────────────────────

type Pos = ReturnType<typeof listPositions>[number];

/** Datos de cada posición sobre los que puede definirse una condición. */
export const CONDITION_FIELDS = [
  "venue",
  // Futuros (Hyperliquid): moneda, sentido y apalancamiento.
  "coin",
  "side",
  "leverage",
  "ageMinutes",
  "pairAgeMinutes",
  "liquidityUsd",
  "mcapUsd",
  "priceChange5mPct",
  "priceChange1hPct",
  "pairPriceChange5mPct",
  "pairPriceChange1hPct",
  "volume1hJupiterVsDexRatio",
  "creatorIsLaunchpadDeployer",
  "priceChange24hPct",
  "buyVolume5mUsd",
  "sellVolume5mUsd",
  "buySellRatio5m",
  "buySellCountRatio5m",
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
  "creatorTokens",
  "creatorGraduated",
  "creatorGraduationPct",
  "devHoldingPct",
  "creatorHoneypots",
  "insidersDetected",
  "lpLockedPct",
  // Lo que lleva operado de tokens del mismo creador (antes, una lista negra fija; ahora, un dato que puede aprender).
  "creatorTradesWithYou",
  "creatorWorstPnlWithYouPct",
  "tokenReportBeforeBuying",
  "researchCallsSinceLastTrade",
  "minutesIntoMission",
  // Cómo decide el agente (no cómo es el token): tamaño, reentrada, promediar y tiempo que queda.
  "portfolioPct",
  "previousTradesInToken",
  "lastPnlInTokenPct",
  "addedWhileDown",
  "minutesLeft",
  // Cuándo y con qué mercado decidió: hora UTC y actividad del último escaneo (tokens de menos de 3 h y
  // mediana de operadores en 5 min).
  "hourUtc",
  "marketYoungTokens",
  "marketMedianTraders5m",
  // Reentrada (cuánto hace y si es en esta misión) y evolución de las lecturas antes de comprar.
  "minutesSinceLastTradeInToken",
  "previousTradesInTokenThisMission",
  "readsBeforeBuy",
  "minutesBetweenReads",
  "liquidityTrendPct",
  "netBuyersTrend",
  "fillVsPricePct",
  "roundTripAtEntryPct",
  // Cuántas creencias negativas se saltó a sabiendas al entrar (thesis.overrides).
  "beliefsOverridden",
  // Cómo iba la misión al entrar: entrada n.º, pérdidas ya cerradas, resultado acumulado y minutos desde la última pérdida.
  "entryNumberInMission",
  "lossesBeforeInMission",
  "missionPnlPctAtEntry",
  "minutesSinceLastLoss",
  // Gestión de la cartera: ganadas antes, racha, pico de la misión y caída desde él, efectivo al entrar y si lo que
  // pone es más o menos que lo ya ganado (para aprender cuándo guardar ganancias y cuándo volver a apostarlas).
  "winsBeforeInMission",
  "streakAtEntry",
  "missionPeakPnlPctAtEntry",
  "drawdownFromPeakPctAtEntry",
  "cashPctAtEntry",
  "riskingProfitsPct",
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

const RESEARCH_FIELDS = new Set([
  "tokenReportBeforeBuying",
  "researchCallsSinceLastTrade",
  "minutesIntoMission",
  "portfolioPct",
  "previousTradesInToken",
  "lastPnlInTokenPct",
  "addedWhileDown",
  "minutesLeft",
  "hourUtc",
  "marketYoungTokens",
  "marketMedianTraders5m",
  "minutesSinceLastTradeInToken",
  "previousTradesInTokenThisMission",
  "readsBeforeBuy",
  "minutesBetweenReads",
  "liquidityTrendPct",
  "netBuyersTrend",
  "fillVsPricePct",
  "roundTripAtEntryPct",
  "beliefsOverridden",
  "entryNumberInMission",
  "lossesBeforeInMission",
  "missionPnlPctAtEntry",
  "minutesSinceLastLoss",
  "winsBeforeInMission",
  "streakAtEntry",
  "missionPeakPnlPctAtEntry",
  "drawdownFromPeakPctAtEntry",
  "cashPctAtEntry",
  "riskingProfitsPct",
]);

function fieldValue(p: Pos, f: Clause["f"]): unknown {
  if (f === "venue") return p.entry.venue ?? p.venue;
  // En BNB Chain el launchpad se deduce de la dirección (también en posiciones antiguas, que guardaban el DEX).
  if (f === "launchpad") return launchpadOf(String(p.entry.venue ?? p.venue), String(p.asset ?? ""), p.entry.launchpad as string | undefined);
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

/** Las cláusulas de una condición que una posición no cumple, con su valor real ("sin dato" si no lo hay). */
function failingClauses(cond: Condition, p: Pos): string[] {
  return cond.all
    .filter((c) => !matches({ all: [c] }, p))
    .map(({ f, op, v }) => {
      const x = fieldValue(p, f);
      return `${f} ${x === undefined || x === null ? "sin dato" : JSON.stringify(x)} (pide ${op} ${JSON.stringify(v)})`;
    });
}

/**
 * Tras una compra: de las creencias que el agente cita en su tesis (beliefs_applied), cuáles cumple de verdad el
 * token y cuáles no, y por qué dato. Se guarda en la posición (citedBeliefsMet / citedBeliefsNotMet) para que la
 * evidencia de "cuando la aplicó" cuente solo las aplicaciones reales. El revisor encontró la #4 citada en 5
 * compras perdedoras que no la cumplían (v0.39.0): el agente creía filtrar con su memoria y no lo hacía.
 */
export function checkCitedBeliefs(missionId: number, venue: string, asset: string, ids: number[]): string[] {
  if (!ids.length) return [];
  const p = listPositions(missionId).find((x) => x.venue === venue && x.asset === asset && x.status === "open");
  if (!p) return [];
  const met: number[] = [];
  const notMet: number[] = [];
  const notes: string[] = [];
  for (const id of [...new Set(ids)]) {
    const b = db.prepare("SELECT * FROM beliefs WHERE id = ?").get(id) as BeliefRow | undefined;
    if (!b?.condition) continue;
    const failing = failingClauses(JSON.parse(b.condition) as Condition, p);
    if (!failing.length) met.push(id);
    else {
      notMet.push(id);
      notes.push(`Citas #${id}, pero este token no la cumple: ${failing.join("; ")}`);
    }
  }
  const row = db.prepare("SELECT research FROM positions WHERE id = ?").get(p.id) as { research: string | null };
  const research = JSON.parse(row.research ?? "{}") as Record<string, unknown>;
  // Al ampliar se queda lo de la entrada.
  if (research.citedBeliefsMet === undefined) {
    research.citedBeliefsMet = met;
    research.citedBeliefsNotMet = notMet;
    db.prepare("UPDATE positions SET research = ? WHERE id = ?").run(JSON.stringify(research), p.id);
  }
  return notes;
}

/**
 * Tras una compra: las creencias de "tiende a perder" que cumple la entrada con los datos del momento de comprar.
 * La ficha ya las marca al leer, pero el agente no siempre lo ve: en la M33 la ficha daba +147 % en 5 min y compró
 * creyendo que eran +85 %. Se le repite al comprar, con el dato que la activa. No frena nada.
 */
export function negativeBeliefsAtEntry(missionId: number, venue: string, asset: string): string[] {
  const p = listPositions(missionId).find((x) => x.venue === venue && x.asset === asset && x.status === "open");
  if (!p) return [];
  const rows = db.prepare("SELECT * FROM beliefs WHERE status = 'active' AND expectation = 'negative' AND condition IS NOT NULL").all() as unknown as BeliefRow[];
  return rows
    .filter((b) => matches(JSON.parse(b.condition!) as Condition, p))
    .map((b) => {
      const cond = JSON.parse(b.condition!) as Condition;
      const data = cond.all.map(({ f }) => `${f} = ${JSON.stringify(fieldValue(p, f))}`).join(", ");
      return `Al comprar, la entrada cumple #${b.id} (tiende a perder): ${b.statement.slice(0, 140)} [${data}]`;
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
    // Además de ganar o perder: cuánto. Una misión con objetivo alto necesita movimientos grandes.
    bestPct: Number(Math.max(...ps.map((p) => p.pnlPct ?? 0)).toFixed(1)),
    worstPct: Number(Math.min(...ps.map((p) => p.pnlPct ?? 0)).toFixed(1)),
    bigWins: ps.filter((p) => (p.pnlPct ?? 0) >= BIG_WIN_PCT).length,
    positionIds: ps.map((p) => p.id),
  };
}

/** A partir de qué subida una operación cuenta como "grande" en la evidencia. */
const BIG_WIN_PCT = 20;

/** Cuánto se movieron las operaciones: media, mejor y cuántas dieron un movimiento grande. */
const magnitude = (t: { trades: number; avgPnlPct?: number; bestPct?: number; bigWins?: number }) =>
  t.trades ? `; media ${t.avgPnlPct} %, mejor ${t.bestPct} %, ${t.bigWins} de ${t.trades} con +${BIG_WIN_PCT} % o más` : "";

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
  /** Desde cuándo vale su condición actual: las operaciones posteriores son su evidencia fuera de muestra. */
  condition_since: string | null;
}

/**
 * Intervalo de Wilson al 95 % de un porcentaje de acierto: con pocos casos es ancho y no deja concluir
 * nada. Con 3 de 3 va del 44 % al 100 %; con 17 de 18, del 74 % al 99 %.
 */
export function wilson(successes: number, n: number): { low: number; high: number } {
  if (!n) return { low: 0, high: 100 };
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: Math.round(Math.max(0, center - half) * 100), high: Math.round(Math.min(1, center + half) * 100) };
}

/** Etapa de una creencia según cuántas operaciones decisivas la respaldan o la refutan. */
export type BeliefStage = "hypothesis" | "provisional" | "rule";

/**
 * Qué dicen los datos de una creencia, con el mismo criterio que su evidencia (intervalo de Wilson al 95 %). Con
 * solo la etapa ("hipótesis" por debajo de 10 casos), una creencia de 1 caso y otra de 4 de 4 parecían iguales y el
 * trader se saltaba las dos (M6 y M7 de la v0.36).
 */
export type BeliefVerdict = "sin evidencia" | "sin confirmar" | "se sostiene" | "los datos la contradicen";
export function beliefVerdict(decided: number, wilsonLow?: number, wilsonHigh?: number): BeliefVerdict {
  if (decided < 3) return "sin evidencia";
  if ((wilsonLow ?? 0) >= 50) return "se sostiene";
  if ((wilsonHigh ?? 100) < 50) return "los datos la contradicen";
  return "sin confirmar";
}
/**
 * Etapa de una creencia según sus casos FUERA DE MUESTRA: las operaciones posteriores a escribir su condición. Con
 * cientos de misiones, el revisor prueba muchas hipótesis y algunas encajan con el pasado por casualidad; solo
 * asciende la que sigue acertando con operaciones que no vio al escribirla.
 */
export const beliefStage = (decidedOutOfSample: number): BeliefStage =>
  decidedOutOfSample >= 20 ? "rule" : decidedOutOfSample >= 5 ? "provisional" : "hypothesis";
const STAGE_LABEL: Record<BeliefStage, string> = {
  hypothesis: "hipótesis (menos de 5 casos nuevos desde que se escribió: puede ser casualidad)",
  provisional: "provisional (5-19 casos nuevos)",
  rule: "regla (20 casos nuevos o más)",
};
/** Últimas operaciones decisivas con las que se mide si una creencia sigue valiendo ahora (el mercado cambia). */
const RECENT_WINDOW = 20;

function beliefEvidence(b: BeliefRow, closed: Pos[]) {
  // Solo las veces que la aplicó de verdad: citarla en una compra que no cumplía su condición no cuenta.
  // Las compras anteriores a guardarlo (v0.40.0) se comprueban con la condición actual.
  const cited = closed.filter((p) => p.beliefsApplied.includes(b.id));
  const condition = b.condition ? (JSON.parse(b.condition) as Condition) : null;
  const notMet = cited.filter(
    (p) => (Array.isArray(p.research.citedBeliefsNotMet) && (p.research.citedBeliefsNotMet as number[]).includes(b.id)) || (condition !== null && !matches(condition, p)),
  );
  const applied = { ...summarizeTrades(cited.filter((p) => !notMet.includes(p))), ...(notMet.length ? { citedWithoutMeetingIt: notMet.length } : {}) };
  const cond = b.condition ? (JSON.parse(b.condition) as Condition) : null;
  let matched: Record<string, unknown> | undefined;
  let verdict = applied.trades
    ? `sin condición; aplicada en ${applied.trades} operaciones: ${applied.wins} ganadas, ${applied.losses} perdidas${magnitude(applied)}`
    : "sin condición y todavía sin operaciones que la apliquen";
  if (cond) {
    const ps = closed.filter((p) => matches(cond, p));
    const wins = ps.filter((p) => outcome(p) === "win").length;
    const losses = ps.filter((p) => outcome(p) === "loss").length;
    const [inFavor, against] = b.expectation === "negative" ? [losses, wins] : [wins, losses];
    const decided = inFavor + against;
    const support = decided ? Math.round((inFavor / decided) * 100) : null;
    const ci = wilson(inFavor, decided);
    // Fuera de muestra: las operaciones abiertas después de escribir la condición (no las pudo "ajustar").
    const since = b.condition_since ?? b.created_at;
    const favorOf = (xs: Pos[]) => xs.filter((p) => outcome(p) === (b.expectation === "negative" ? "loss" : "win")).length;
    const decidedOf = (xs: Pos[]) => xs.filter((p) => outcome(p) === "win" || outcome(p) === "loss");
    const oos = decidedOf(ps.filter((p) => p.openedAt >= since));
    const oosFavor = favorOf(oos);
    const oosCi = wilson(oosFavor, oos.length);
    const stage = beliefStage(oos.length);
    // Reciente: las últimas operaciones decisivas, para ver si sigue valiendo ahora.
    const recent = decidedOf(ps)
      .sort((x, y) => String(x.closedAt).localeCompare(String(y.closedAt)))
      .slice(-RECENT_WINDOW);
    const recentSupport = recent.length ? Math.round((favorOf(recent) / recent.length) * 100) : null;
    const drift = support !== null && recentSupport !== null && recent.length >= 8 && decided > recent.length && Math.abs(recentSupport - support) >= 25;
    const summary = summarizeTrades(ps);
    matched = {
      ...summary,
      inFavor,
      against,
      supportPct: support,
      wilsonLowPct: ci.low,
      wilsonHighPct: ci.high,
      stage,
      outOfSample: { since, inFavor: oosFavor, against: oos.length - oosFavor, wilsonLowPct: oosCi.low, wilsonHighPct: oosCi.high },
      ...(recentSupport !== null ? { recent: { trades: recent.length, supportPct: recentSupport } } : {}),
      ...(drift ? { drift: `antes acertaba el ${support} % y en las últimas ${recent.length} el ${recentSupport} %: quizá el mercado ha cambiado` } : {}),
    };
    const counts = `${inFavor} a favor, ${against} en contra; acierto ${support} %, intervalo ${ci.low}-${ci.high} %`;
    verdict =
      decided < 3
        ? `sin evidencia suficiente (${decided} operaciones decisivas; hacen falta al menos 3)`
        : ci.low >= 50
          ? `se sostiene (${counts})`
          : ci.high < 50
            ? `los datos la contradicen (${counts})`
            : `sin confirmar (${counts})`;
    if (decided >= 3) verdict += ` · ${STAGE_LABEL[stage]}`;
    verdict += ` · fuera de muestra: ${oosFavor} a favor, ${oos.length - oosFavor} en contra`;
    if (oos.length >= 5 && oosCi.high < 50) verdict += " · ⚠ desde que se escribió, los datos nuevos la contradicen";
    if (drift) verdict += ` · ⚠ ${(matched as { drift: string }).drift}`;
    verdict += magnitude(summary);
  }
  const skipped = overrideRecord(b.id, closed);
  return { verdict, appliedIn: applied, ...(matched ? { matchingTrades: matched } : {}), ...(skipped ? { whenOverridden: skipped } : {}) };
}

/**
 * Cómo le fue al agente las veces que se saltó a sabiendas esta creencia (thesis.overrides): el precio real de
 * ignorar su memoria, con sus propias operaciones. null si nunca se la ha saltado.
 */
export function overrideRecord(beliefId: number, closed: Pos[] = closedPositions()) {
  const ps = closed.filter((p) => Array.isArray(p.research.overriddenBeliefIds) && (p.research.overriddenBeliefIds as number[]).includes(beliefId));
  if (!ps.length) return null;
  const pcts = ps.map((p) => p.pnlPct ?? 0);
  return {
    times: ps.length,
    won: ps.filter((p) => (p.pnlUsd ?? 0) > 0).length,
    avgPnlPct: Number((pcts.reduce((s, x) => s + x, 0) / ps.length).toFixed(1)),
    text: `te la has saltado ${ps.length} ${ps.length === 1 ? "vez" : "veces"}: ${ps.filter((p) => (p.pnlUsd ?? 0) > 0).length} ganadas, media ${(pcts.reduce((s, x) => s + x, 0) / ps.length).toFixed(1)} %`,
  };
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
  return db.prepare("SELECT * FROM missions WHERE status IN ('succeeded', 'expired', 'bust', 'cancelled') ORDER BY id").all() as unknown as Mission[];
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

// ─── Mapa de lo explorado ───────────────────────────────────────────────────
// Cuántas operaciones lleva en cada zona (cadena, edad y liquidez del token; futuros por moneda) y cómo le fue.
// Solo datos: las zonas vacías son las que nunca ha probado, y las de 1-2 operaciones no demuestran nada todavía.

const AGE_BUCKETS: Array<[string, number]> = [["<1 h", 60], ["1-3 h", 180], ["3-24 h", 1440], ["1-7 d", 10080], [">7 d", Infinity]];
const LIQ_BUCKETS: Array<[string, number]> = [["<15k", 15_000], ["15-50k", 50_000], ["50-200k", 200_000], ["200k-1M", 1_000_000], [">1M", Infinity]];
const bucket = (v: unknown, buckets: Array<[string, number]>) => (typeof v === "number" ? buckets.find(([, max]) => v < max)![0] : "sin dato");

export function explorationMap() {
  const closed = closedPositions();
  const cell = (ps: Pos[]) => {
    const s = summarizeTrades(ps);
    return s.trades ? { trades: s.trades, wins: s.wins, losses: s.losses, avgPnlPct: s.avgPnlPct } : { trades: 0 };
  };
  const byVenue: Record<string, ReturnType<typeof cell>> = {};
  for (const venue of new Set(closed.map((p) => p.venue))) byVenue[venue] = cell(closed.filter((p) => p.venue === venue));
  // Contado: edad × liquidez del token al entrar, con todas las casillas (también las vacías).
  const spot = closed.filter((p) => p.venue !== "hyperliquid");
  const spotByAgeAndLiquidity = AGE_BUCKETS.map(([age]) => ({
    age,
    ...Object.fromEntries(
      LIQ_BUCKETS.map(([liq]) => {
        const ps = spot.filter((p) => bucket(p.entry.ageMinutes, AGE_BUCKETS) === age && bucket(p.entry.liquidityUsd, LIQ_BUCKETS) === liq);
        const c = cell(ps);
        return [liq, c.trades ? `${c.trades} op: ${c.wins}G/${c.losses}P, media ${c.avgPnlPct} %` : "sin probar"];
      }),
    ),
  }));
  const perps = closed.filter((p) => p.venue === "hyperliquid");
  const perpsByCoin: Record<string, ReturnType<typeof cell>> = {};
  for (const coin of new Set(perps.map((p) => p.symbol.split("-")[0]!))) perpsByCoin[coin] = cell(perps.filter((p) => p.symbol.startsWith(`${coin}-`)));
  // Cuánto ha mirado cada cadena (escaneos), frente a cuánto ha operado en ella.
  const scans = db.prepare("SELECT target, COUNT(*) AS n FROM research_log WHERE tool = 'scan_market' AND target IS NOT NULL GROUP BY target").all() as Array<{ target: string; n: number }>;
  const scansByChain: Record<string, number> = {};
  for (const s of scans) for (const c of s.target === "all" ? ["solana", "base", "bsc"] : [s.target]) scansByChain[c] = (scansByChain[c] ?? 0) + s.n;
  return {
    closedTrades: closed.length,
    byVenue,
    scansByChain,
    spotByAgeAndLiquidity,
    note: "Operaciones cerradas por zona. \"sin probar\" = ninguna operación ahí; con 1-2 operaciones una zona no está probada.",
  };
}

// ─── Freno de memoria: lo aprendido que no se puede pasar por alto ──────────

/**
 * Una creencia negativa con evidencia fuerte bloquea las compras que la cumplen, salvo que el agente
 * la ignore de forma explícita y diga por qué. Así lo aprendido no se olvida por despiste, pero el
 * agente sigue siendo libre de explorar (y esas compras siguen contando como evidencia).
 */
/** Fuerte: al menos 4 casos decisivos, el límite inferior del intervalo de Wilson ≥ 50 % y una media ≤ -15 %. */
export const STRONG_NEGATIVE = { minDecided: 4, minWilsonLowPct: 50, maxAvgPnlPct: -15 };

export interface BlockingBelief {
  id: number;
  statement: string;
  verdict: string;
  /** Las veces que el agente se la saltó y cómo le fue. */
  whenOverridden?: string;
}

/**
 * Lista negra de creadores: tokens del mismo creador que ya le costaron al agente un 80 % o más (rug,
 * honeypot…). Los "sindicatos" de rugs lanzan decenas de tokens: el historial del creador es el mejor filtro.
 */
export function creatorRugs(creator: string | undefined): Array<{ symbol: string; missionId: number | null; pnlPct: number }> {
  if (!creator) return [];
  return db
    .prepare(
      `SELECT symbol, mission_id, (realized_proceeds_usd - realized_cost_usd) * 100.0 / realized_cost_usd AS pnl FROM positions
       WHERE status = 'closed' AND realized_cost_usd > 0 AND lower(json_extract(entry_features, '$.creator')) = lower(?)
         AND (realized_proceeds_usd - realized_cost_usd) / realized_cost_usd <= -0.8`,
    )
    .all(creator)
    .map((r: any) => ({ symbol: r.symbol, missionId: r.mission_id, pnlPct: Math.round(r.pnl) }));
}

/** Creencias negativas fuertes que cumple una compra con estos datos de entrada. */
export function blockingBeliefs(venue: string, entry: Record<string, unknown>, asset = "", decision: Record<string, unknown> = {}): BlockingBelief[] {
  const closed = closedPositions();
  const pos = { venue, asset, entry: { ...entry, venue }, research: decision } as unknown as Pos;
  return (db.prepare("SELECT * FROM beliefs WHERE status = 'active' AND expectation = 'negative' AND condition IS NOT NULL").all() as unknown as BeliefRow[])
    .filter((b) => matches(JSON.parse(b.condition!) as Condition, pos))
    .map((b) => ({ b, ev: beliefEvidence(b, closed) }))
    .filter(({ ev }) => isStrongNegative(ev))
    .map(({ b, ev }) => ({ id: b.id, statement: b.statement, verdict: ev.verdict, ...(ev.whenOverridden ? { whenOverridden: ev.whenOverridden.text } : {}) }));
}

function isStrongNegative(ev: ReturnType<typeof beliefEvidence>) {
  const t = ev.matchingTrades as
    | { inFavor?: number; against?: number; wilsonLowPct?: number; avgPnlPct?: number; outOfSample?: { inFavor: number; against: number; wilsonHighPct: number } }
    | undefined;
  // Si las operaciones posteriores a escribirla la contradicen, ya no frena: lo que aprendió puede haber sido casualidad.
  const oos = t?.outOfSample;
  if (oos && oos.inFavor + oos.against >= 4 && oos.wilsonHighPct < 50) return false;
  return (
    t !== undefined &&
    (t.inFavor ?? 0) + (t.against ?? 0) >= STRONG_NEGATIVE.minDecided &&
    (t.wilsonLowPct ?? 0) >= STRONG_NEGATIVE.minWilsonLowPct &&
    (t.avgPnlPct ?? 0) <= STRONG_NEGATIVE.maxAvgPnlPct
  );
}

/**
 * Qué dice la memoria de un token antes de comprarlo: creencias negativas fuertes que frenarían la compra
 * (block), otras negativas cuya condición cumple (caution) y positivas que cumple (favor). Solo ids: el
 * texto lo tiene el agente en su resumen de memoria.
 */
export function beliefsFor(venue: string, entry: Record<string, unknown>, asset = "", decision: Record<string, unknown> = {}) {
  const pos = { venue, asset, entry: { ...entry, venue }, research: decision } as unknown as Pos;
  const block = new Set<number>();
  const rows = (db.prepare("SELECT * FROM beliefs WHERE status = 'active' AND condition IS NOT NULL").all() as unknown as BeliefRow[]).filter((b) =>
    matches(JSON.parse(b.condition!) as Condition, pos),
  );
  // Con cuántos casos cuenta cada una: una creencia de 1-2 operaciones no descarta nada todavía, y sin verlo
  // al lado del id, el trader las usaba todas como filtros duros y dejó de explorar (M11-M17 de la v0.35).
  const closed = rows.length ? closedPositions() : [];
  const cases: Record<number, { inFavor: number; against: number; stage: BeliefStage; verdict: BeliefVerdict }> = {};
  for (const b of rows) {
    const ev = beliefEvidence(b, closed);
    if (b.expectation === "negative" && isStrongNegative(ev)) block.add(b.id);
    const t = ev.matchingTrades as { inFavor?: number; against?: number; stage?: BeliefStage; wilsonLowPct?: number; wilsonHighPct?: number } | undefined;
    const inFavor = t?.inFavor ?? 0;
    const against = t?.against ?? 0;
    cases[b.id] = { inFavor, against, stage: t?.stage ?? "hypothesis", verdict: beliefVerdict(inFavor + against, t?.wilsonLowPct, t?.wilsonHighPct) };
  }
  return {
    block: [...block],
    caution: rows.filter((b) => b.expectation === "negative" && !block.has(b.id)).map((b) => b.id),
    favor: rows.filter((b) => b.expectation === "positive").map((b) => b.id),
    cases,
  };
}

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
            : `${m.open_target ? "sin objetivo" : m.status === "succeeded" ? "objetivo conseguido" : "no llegó al objetivo"}: ${m.initial_usd} → ${m.final_usd?.toFixed(2)} USD (${(
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
  // Con límite, tantas creencias negativas como positivas: si solo ve las que le animan a entrar, las elige a su favor.
  const balanced = (xs: typeof beliefs) => {
    if (!limit) return xs;
    const neg = xs.filter((b) => b.expectation === "tiende a perder");
    const rest = xs.filter((b) => b.expectation !== "tiende a perder");
    const out: typeof beliefs = [];
    for (let i = 0; out.length < limit && (i < neg.length || i < rest.length); i++) {
      if (i < rest.length) out.push(rest[i]!);
      if (i < neg.length && out.length < limit) out.push(neg[i]!);
    }
    return out;
  };
  return {
    currentMission: current && curProfile ? { missionId: current.id, profile: describe(curProfile) } : null,
    missionHistory: cut(history),
    howtos,
    beliefs: balanced(beliefs),
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

const clip = (text: unknown, n: number) => {
  const s = String(text ?? "");
  return s.length > n ? `${s.slice(0, n).replace(/\s\S*$/, "")}…` : s;
};

/**
 * La memoria resumida: lo más relevante primero y los textos largos recortados. Crece con cada misión,
 * y el agente la consulta a menudo: el detalle completo está en recall con detail "completo".
 */
export function recallSummary(missionId?: number | null) {
  const full = recall(missionId, 8);
  return {
    currentMission: full.currentMission,
    missionHistory: full.missionHistory.slice(0, 5).map(({ distance: _d, ...h }) => ({ ...h, ...(h.nextTime ? { nextTime: clip(h.nextTime, 220) } : {}) })),
    // Los howtos, solo por título: el texto de los que necesites, con howto_ids.
    howtos: full.howtos.map((h) => `#${h.id} [${h.scope}/${h.topic}] ${h.title}`),
    beliefs: full.beliefs.slice(0, 8).map((b) => ({
      id: b.id,
      statement: clip(b.statement, 200),
      ...(b.condition ? { condition: b.condition, expectation: b.expectation } : {}),
      evidence: b.evidence.verdict,
    })),
    totalBeliefs: full.totalBeliefs,
    tradeStats: full.tradeStats.allMissions,
    recurringErrors: (full.recurringErrors as Array<Record<string, unknown>>).slice(0, 5).map((e) => ({ ...e, errorClass: clip(e.errorClass, 140) })),
    note:
      "Resumen: howtos por título y las 8 creencias más relevantes. recall_memory con howto_ids trae el texto de esos howtos; " +
      "con detail: completo, todo (es largo: úsalo solo si lo necesitas).",
  };
}

/** El texto completo de unos howtos concretos. */
export function howtosById(ids: number[]) {
  if (!ids.length) return [];
  return db.prepare(`SELECT id, scope, topic, title, steps, status FROM howtos WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY id`).all(...ids);
}

/**
 * Para el revisor: el catálogo compacto (ids, títulos, creencias recortadas con su evidencia). El
 * detalle de lo que vaya a tocar, con howto_ids y belief_ids.
 */
export function memoryCatalog(missionId: number | null, opts: { howtoIds?: number[]; beliefIds?: number[]; full?: boolean } = {}) {
  const all = recall(missionId);
  if (opts.full) return all;
  const pick = new Set(opts.beliefIds ?? []);
  return {
    currentMission: all.currentMission,
    howtos: all.howtos.map((h) => `#${h.id} [${h.scope}/${h.topic}] ${h.title}`),
    beliefs: all.beliefs.map((b) =>
      pick.has(b.id)
        ? b
        : { id: b.id, statement: clip(b.statement, 160), ...(b.condition ? { expectation: b.expectation } : {}), evidence: b.evidence.verdict },
    ),
    ...(opts.howtoIds?.length ? { howtoDetail: howtosById(opts.howtoIds) } : {}),
    missionHistory: all.missionHistory.slice(0, 8).map(({ distance: _d, ...h }) => ({ ...h, ...(h.nextTime ? { nextTime: clip(h.nextTime, 220) } : {}) })),
    tradeStats: all.tradeStats.allMissions,
    note: "Catálogo compacto. Con howto_ids o belief_ids, el detalle de esos; con full: true, todo.",
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

/**
 * Cada cambio en la memoria queda en la actividad de la misión de la que sale (o de la activa o la última),
 * para que el panel lo muestre: con la memoria ya formada, el revisor sobre todo corrige y amplía lo que hay.
 */
function logLearning(_sourceMission: number | null | undefined, title: string, body?: string) {
  // Va a la misión que se está viendo (la activa o la última), no a la de origen: el revisor escribe al
  // terminar una misión y el panel pasa enseguida a la siguiente.
  const target = (getActiveMission() ?? getLastMission())?.id ?? null;
  logActivity({ missionId: target, sessionId: null, kind: "lesson", title, body });
}

/** Lo último que ha cambiado en la memoria, de cualquier misión (para el panel). */
export function recentLearning(limit = 5) {
  return db.prepare("SELECT ts, title FROM activity WHERE kind = 'lesson' ORDER BY id DESC LIMIT ?").all(limit) as Array<{ ts: string; title: string }>;
}

// ─── Límites e higiene de la memoria ────────────────────────────────────────
// La memoria se lee en cada misión: si crece sin podarse, cuesta más y se lee peor. Por encima de estos
// límites no se escribe nada nuevo hasta fusionar o retirar algo.
export const HOWTO_LIMIT = 18;
export const BELIEF_LIMIT = 18;

const activeCount = (table: "howtos" | "beliefs") => (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE status = 'active'`).get() as { n: number }).n;

/** Parecido entre dos conjuntos de posiciones (Jaccard). */
const overlap = (a: number[], b: number[]) => {
  const sa = new Set(a);
  const inter = b.filter((x) => sa.has(x)).length;
  return inter / (sa.size + b.length - inter || 1);
};

/**
 * Otra creencia activa, con la misma expectativa, que cubre (casi) las mismas operaciones: aunque la
 * condición o el texto sean distintos, dice lo mismo según los datos.
 */
function evidenceTwin(cond: Condition, expectation: string, closed: Pos[], exceptId?: number): number | undefined {
  const mine = closed.filter((p) => matches(cond, p)).map((p) => p.id);
  if (mine.length < 3) return undefined;
  const others = db
    .prepare("SELECT id, condition FROM beliefs WHERE status = 'active' AND condition IS NOT NULL AND expectation = ? AND id IS NOT ?")
    .all(expectation, exceptId ?? null) as Array<{ id: number; condition: string }>;
  return others.find((o) => overlap(mine, closed.filter((p) => matches(JSON.parse(o.condition) as Condition, p)).map((p) => p.id)) >= 0.8)?.id;
}

/** Lo que el revisor debería consolidar: duplicados por evidencia, creencias contradichas y exceso de howtos. */
export function memoryHygiene() {
  const closed = closedPositions();
  const beliefs = db.prepare("SELECT * FROM beliefs WHERE status = 'active' ORDER BY id").all() as unknown as BeliefRow[];
  const withEv = beliefs.map((b) => ({ b, ev: beliefEvidence(b, closed) }));
  const duplicates: Array<{ ids: number[]; sharedTrades: number }> = [];
  for (let i = 0; i < withEv.length; i++) {
    for (let j = i + 1; j < withEv.length; j++) {
      const [x, y] = [withEv[i]!, withEv[j]!];
      if (!x.b.condition || !y.b.condition || x.b.expectation !== y.b.expectation) continue;
      const px = (x.ev.matchingTrades?.positionIds as number[] | undefined) ?? [];
      const py = (y.ev.matchingTrades?.positionIds as number[] | undefined) ?? [];
      if (px.length >= 3 && py.length >= 3 && overlap(px, py) >= 0.8) duplicates.push({ ids: [x.b.id, y.b.id], sharedTrades: px.filter((p) => py.includes(p)).length });
    }
  }
  const contradicted = withEv
    .filter(({ ev }) => {
      // Contradicha: incluso el límite superior del intervalo queda por debajo del 50 %.
      const t = ev.matchingTrades as { inFavor?: number; against?: number; wilsonHighPct?: number } | undefined;
      return t && (t.inFavor ?? 0) + (t.against ?? 0) >= 3 && (t.wilsonHighPct ?? 100) < 50;
    })
    .map(({ b, ev }) => ({ id: b.id, statement: clip(b.statement, 120), verdict: ev.verdict }));
  const howtos = db.prepare("SELECT id, scope, topic, title, LENGTH(steps) AS chars FROM howtos WHERE status = 'active' ORDER BY scope, topic, id").all() as Array<{
    id: number;
    scope: string;
    topic: string;
    title: string;
    chars: number;
  }>;
  const fps = new Map(howtos.map((h) => [h.id, fingerprint(`${h.title} ${h.topic}`)]));
  const similarHowtos: number[][] = [];
  for (let i = 0; i < howtos.length; i++) {
    for (let j = i + 1; j < howtos.length; j++) {
      if (similarity(fps.get(howtos[i]!.id)!, fps.get(howtos[j]!.id)!) >= 0.3) similarHowtos.push([howtos[i]!.id, howtos[j]!.id]);
    }
  }
  const tooMany = howtos.length > HOWTO_LIMIT || beliefs.length > BELIEF_LIMIT;
  return {
    counts: { howtos: howtos.length, howtoLimit: HOWTO_LIMIT, beliefs: beliefs.length, beliefLimit: BELIEF_LIMIT },
    ...(tooMany ? { mustConsolidate: "Hay más memoria de la que admite el límite: fusiona o retira antes de escribir nada nuevo (write_howto y write_belief lo rechazarán)." } : {}),
    duplicateBeliefs: duplicates,
    contradictedBeliefs: contradicted,
    similarHowtos,
    howtoIndex: howtos.map((h) => `#${h.id} [${h.scope}/${h.topic}] ${h.title} (${h.chars} car.)`),
  };
}

/**
 * Tamaño máximo del texto de un howto. Con cientos de misiones, ampliarlos sin límite los convertía en textos enormes
 * que el trader no lee entero: al pasarlo, hay que reescribirlo resumido (lo esencial, no la historia de cada caso).
 */
export const HOWTO_MAX_CHARS = 1200;
function checkHowtoSize(steps: string) {
  if (steps.length > HOWTO_MAX_CHARS) {
    throw new Error(
      `El howto tendría ${steps.length} caracteres y el máximo es ${HOWTO_MAX_CHARS}: reescríbelo resumido, con lo esencial (los pasos y los ` +
        "errores a evitar), sin la historia de cada caso. Los casos ya están en las operaciones y en las retrospectivas.",
    );
  }
}

export function writeHowto(a: { scope: string; topic: string; title: string; steps: string; missionId: number | null; fixesErrorIds?: number[] }) {
  checkHowtoSize(a.steps);
  if (activeCount("howtos") >= HOWTO_LIMIT) {
    throw new Error(
      `Ya hay ${HOWTO_LIMIT} howtos activos o más: amplía uno existente (update_howto) o fusiona y retira alguno antes de escribir otro. ` +
        `Candidatos a retirar o fusionar, con datos: ${JSON.stringify(retireCandidates().howtos)}`,
    );
  }
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
  logLearning(a.missionId, `Nuevo howto #${id}: ${a.title}`, a.steps);
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
  if (a.steps !== undefined && a.status !== "obsolete") checkHowtoSize(steps);
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
  logLearning(null, a.status === "obsolete" ? `Da por obsoleto el howto #${a.id}: ${title}` : `Amplía el howto #${a.id}: ${title}`, a.steps);
}

function validateCondition(cond: Condition | undefined, expectation: string | undefined) {
  if (cond && !expectation) throw new Error("Una creencia con condición necesita expectation: positive (tiende a ganar) o negative (tiende a perder)");
}

const sameCondition = (cond: Condition | undefined, exceptId = 0) =>
  cond ? (db.prepare("SELECT id FROM beliefs WHERE status = 'active' AND condition = ? AND id != ?").get(JSON.stringify(cond), exceptId) as { id: number } | undefined)?.id : undefined;

/**
 * Una creencia retirada que dice lo mismo: misma condición, texto casi igual o casi las mismas operaciones con la
 * misma expectativa. El revisor escribió "la 2.ª entrada y siguientes pierden" tres veces (#19, #21, #22) y las tres
 * la retiró por lo mismo: el control de duplicados solo miraba las activas.
 */
function retiredTwin(a: { statement: string; expectation?: string; condition?: Condition }, fp: string) {
  const rows = db.prepare("SELECT * FROM beliefs WHERE status = 'retired' ORDER BY id DESC").all() as unknown as BeliefRow[];
  const cond = a.condition ? JSON.stringify(a.condition) : undefined;
  const closed = a.condition && a.expectation ? closedPositions() : [];
  const mine = a.condition ? closed.filter((p) => matches(a.condition!, p)).map((p) => p.id) : [];
  return rows.find((r) => {
    if (cond && r.condition === cond) return true;
    if (similarity(r.fingerprint, fp) >= DUPLICATE_THRESHOLD) return true;
    if (mine.length < 3 || !r.condition || r.expectation !== a.expectation) return false;
    return overlap(mine, closed.filter((p) => matches(JSON.parse(r.condition!) as Condition, p)).map((p) => p.id)) >= 0.8;
  });
}

export function writeBelief(a: {
  statement: string;
  appliesTo: string;
  expectation?: "positive" | "negative";
  condition?: Condition;
  missionId: number | null;
  /** Volver a probar a propósito una idea ya retirada (si han llegado operaciones que pueden cambiar el resultado). */
  retest?: boolean;
}) {
  validateCondition(a.condition, a.expectation);
  if (activeCount("beliefs") >= BELIEF_LIMIT) {
    throw new Error(
      `Ya hay ${BELIEF_LIMIT} creencias activas o más: corrige una existente (revise_belief) o retira alguna antes de escribir otra. ` +
        `Candidatas a retirar, con datos: ${JSON.stringify(retireCandidates().beliefs)}`,
    );
  }
  const fp = fingerprint(a.statement);
  const dup = duplicateOf("beliefs", fp) ?? sameCondition(a.condition);
  if (dup) throw new Error(`Ya hay una creencia casi igual o con la misma condición (#${dup}). Corrígela con revise_belief en lugar de crear otra.`);
  const twin = a.condition && a.expectation ? evidenceTwin(a.condition, a.expectation, closedPositions()) : undefined;
  if (twin) throw new Error(`La creencia #${twin} ya cubre casi las mismas operaciones con la misma expectativa: dicen lo mismo según los datos. Corrígela con revise_belief en lugar de crear otra.`);
  const retired = a.retest ? undefined : retiredTwin(a, fp);
  if (retired) {
    throw new Error(
      `Ya la probaste como #${retired.id} y la retiraste el ${retired.updated_at.slice(0, 10)} porque: ${retired.status_reason ?? "sin motivo anotado"}. ` +
        "Si crees que los datos han cambiado (han llegado operaciones que pueden darle la vuelta), vuelve a escribirla con retest: true.",
    );
  }
  const id = Number(
    db
      .prepare(
        `INSERT INTO beliefs (created_at, condition_since, updated_at, source_mission_id, statement, applies_to, expectation, condition, fingerprint)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(now(), now(), now(), a.missionId, a.statement, a.appliesTo, a.expectation ?? null, a.condition ? JSON.stringify(a.condition) : null, fp).lastInsertRowid,
  );
  const view = beliefView(getBelief(id), closedPositions());
  logLearning(a.missionId, `Nueva creencia #${id}: ${a.statement}`, view.evidence.verdict);
  return view;
}

function getBelief(id: number) {
  const b = db.prepare("SELECT * FROM beliefs WHERE id = ?").get(id) as unknown as BeliefRow | undefined;
  if (!b) throw new Error(`No existe la creencia #${id}`);
  return b;
}

/**
 * Qué conviene retirar cuando la memoria está llena, con datos: creencias que los datos nuevos contradicen, que nunca
 * han tenido casos o que no se aplican desde hace muchas misiones, y howtos que el trader no cita. Con cientos de
 * misiones, el criterio de cada momento del revisor no basta para mantener la memoria limpia.
 */
export function retireCandidates() {
  const closed = closedPositions();
  const missionsSince = (ts: string) => (db.prepare("SELECT COUNT(*) AS n FROM missions WHERE created_at > ? AND status != 'active'").get(ts) as { n: number }).n;
  const beliefs = (db.prepare("SELECT * FROM beliefs WHERE status = 'active'").all() as unknown as BeliefRow[])
    .map((b) => {
      const ev = beliefEvidence(b, closed);
      const t = ev.matchingTrades as { inFavor?: number; against?: number; outOfSample?: { inFavor: number; against: number; wilsonHighPct: number }; drift?: string } | undefined;
      const decided = (t?.inFavor ?? 0) + (t?.against ?? 0);
      const oos = t?.outOfSample;
      const age = missionsSince(b.created_at);
      const reason =
        oos && oos.inFavor + oos.against >= 5 && oos.wilsonHighPct < 50
          ? `los datos nuevos la contradicen (${oos.inFavor} a favor, ${oos.against} en contra desde que se escribió)`
          : !b.condition && !ev.appliedIn.trades && age >= 5
            ? `sin condición y sin aplicarse en ${age} misiones`
            : b.condition && decided < 3 && age >= 10
              ? `casi sin casos (${decided}) tras ${age} misiones: su condición apenas se da`
              : t?.drift
                ? `ha dejado de valer: ${t.drift}`
                : null;
      return reason ? { id: b.id, statement: b.statement.slice(0, 120), reason } : null;
    })
    .filter(Boolean);
  // Howtos: cuántas veces los cita el trader en sus tesis y notas de memoria (howto #N).
  const cites = new Map<number, number>();
  for (const p of listPositions()) {
    const text = `${p.thesis ?? ""} ${p.lessonsApplied ?? ""}`;
    for (const m of text.matchAll(/howtos?\s*#?(\d+)/gi)) cites.set(Number(m[1]), (cites.get(Number(m[1])) ?? 0) + 1);
  }
  const howtos = (db.prepare("SELECT id, title, created_at FROM howtos WHERE status = 'active'").all() as Array<{ id: number; title: string; created_at: string }>)
    .map((h) => ({ id: h.id, title: h.title.slice(0, 100), citedInTrades: cites.get(h.id) ?? 0, missionsSinceCreated: missionsSince(h.created_at) }))
    .filter((h) => h.citedInTrades === 0 && h.missionsSinceCreated >= 5)
    .map((h) => ({ ...h, reason: `no se ha citado en ninguna operación en ${h.missionsSinceCreated} misiones` }));
  return { beliefs, howtos };
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
  // Cambiar la condición o la expectativa no puede dejar dos creencias activas que digan lo mismo.
  if (!a.retire && b.status === "active" && (a.condition || a.expectation) && condition && expectation) {
    const cond = JSON.parse(condition) as Condition;
    const dup = sameCondition(cond, a.id);
    if (dup) throw new Error(`Con esa condición sería igual que la creencia #${dup}. Si sobran, retira una de las dos.`);
    const twin = evidenceTwin(cond, expectation, closedPositions(), a.id);
    if (twin) throw new Error(`Con esa condición cubriría casi las mismas operaciones que la creencia #${twin} con la misma expectativa. Si sobran, retira una de las dos.`);
  }
  // Cambiar la condición o la expectativa empieza de nuevo la cuenta fuera de muestra: es otra hipótesis.
  const conditionChanged = condition !== b.condition || expectation !== b.expectation;
  db.prepare(
    `UPDATE beliefs SET statement = ?, applies_to = ?, expectation = ?, condition = ?, fingerprint = ?, status = ?, status_reason = ?, updated_at = ?,
       condition_since = CASE WHEN ? THEN ? ELSE condition_since END WHERE id = ?`,
  ).run(statement, a.appliesTo ?? b.applies_to, expectation, condition, fingerprint(statement), a.retire ? "retired" : b.status, a.reason, now(), conditionChanged ? 1 : 0, now(), a.id);
  const view = beliefView(getBelief(a.id), closedPositions());
  logLearning(null, `${a.retire ? "Retira" : "Corrige"} la creencia #${a.id}: ${statement}`, `${a.reason} · ${view.evidence.verdict}`);
  return view;
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
         WHERE (m.status IN ('succeeded', 'expired', 'bust') OR (m.status = 'cancelled' AND EXISTS (SELECT 1 FROM positions p WHERE p.mission_id = m.id)))
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

/** Corrige campos de una retrospectiva ya escrita (solo los que se indiquen), con el motivo. */
export function reviseMissionReview(a: { missionId: number; whatWasTried?: string; whatHappened?: string; surprises?: string; nextTime?: string; reason: string }) {
  const r = db.prepare("SELECT * FROM mission_reviews WHERE mission_id = ?").get(a.missionId) as
    | { what_was_tried: string; what_happened: string; surprises: string | null; next_time: string }
    | undefined;
  if (!r) throw new Error(`La misión #${a.missionId} no tiene retrospectiva: escríbela con write_mission_review`);
  const changed = (["whatWasTried", "whatHappened", "surprises", "nextTime"] as const).filter((k) => a[k] !== undefined);
  if (!changed.length) throw new Error("Indica al menos un campo que corregir (what_was_tried, what_happened, surprises o next_time)");
  db.prepare("UPDATE mission_reviews SET what_was_tried = ?, what_happened = ?, surprises = ?, next_time = ? WHERE mission_id = ?").run(
    a.whatWasTried ?? r.what_was_tried,
    a.whatHappened ?? r.what_happened,
    a.surprises ?? r.surprises,
    a.nextTime ?? r.next_time,
    a.missionId,
  );
  // Cada campo se sustituye entero: lo que había se devuelve (y queda en la actividad) para que se vea qué se
  // ha cambiado y no se pierda sin querer lo que no se quería tocar.
  const column = { whatWasTried: "what_was_tried", whatHappened: "what_happened", surprises: "surprises", nextTime: "next_time" } as const;
  const previous = Object.fromEntries(changed.map((k) => [column[k], r[column[k]] ?? ""]));
  logActivity({
    missionId: a.missionId,
    sessionId: null,
    kind: "lesson",
    title: `Corrige la retrospectiva de la misión #${a.missionId}: ${a.reason}`,
    body: changed.map((k) => `Antes, ${column[k]}: ${previous[column[k]]}`).join("\n\n"),
  });
  return { missionId: a.missionId, corrected: changed, previous };
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

/**
 * Cómo ha jugado el trader en sus últimas misiones terminadas, para que el revisor vea si repite siempre
 * el mismo enfoque (y con qué resultado) y, si está estancado, proponga uno distinto de verdad.
 */
export function recentApproach(count = 8) {
  const missions = db
    .prepare("SELECT * FROM missions WHERE status IN ('succeeded', 'expired', 'bust', 'cancelled') AND final_usd IS NOT NULL ORDER BY id DESC LIMIT ?")
    .all(count) as unknown as Mission[];
  if (!missions.length) return null;
  const perMission = missions.reverse().map((m) => {
    const ps = listPositions(m.id).filter((p) => p.status !== "moved");
    const ages = ps.map((p) => p.entry.ageMinutes).filter((a): a is number => typeof a === "number").sort((a, b) => a - b);
    const orders = (db.prepare("SELECT COUNT(*) AS n FROM orders WHERE mission_id = ?").get(m.id) as { n: number }).n;
    // Minutos parado al final: desde la última operación hasta que acabó (sin haber llegado al objetivo). Los
    // futuros cuentan: en la M16 de la v0.35.6 un largo abierto a 7 min del final salía como "parado en efectivo".
    const lastTrade = (db.prepare("SELECT MAX(ts) AS ts FROM journal WHERE mission_id = ? AND kind IN ('swap', 'cex_order', 'transfer', 'perp') AND (reasoning IS NULL OR reasoning NOT LIKE 'Cierre %') AND (reasoning IS NULL OR reasoning NOT LIKE 'Parada %')").get(m.id) as { ts: string | null }).ts;
    const end = new Date(m.ended_at ?? m.deadline).getTime();
    const durationMin = (new Date(m.deadline).getTime() - new Date(m.started_at ?? m.created_at).getTime()) / 60_000;
    const idleAtEndMinutes = m.status === "succeeded" || !lastTrade ? 0 : Math.max(0, Math.round((end - new Date(lastTrade).getTime()) / 60_000));
    // Esperar con una posición abierta no es rendirse; esperar en efectivo, sí. La posición se anota unos
    // milisegundos después que el swap en el diario: si la última operación fue justo esa compra, cuenta (en la
    // M3 de la v0.35.3, THUMB abierta hasta el final salía como "aparcado en efectivo").
    const holding =
      !!lastTrade &&
      !!db
        .prepare("SELECT 1 FROM positions WHERE mission_id = ? AND status != 'moved' AND opened_at <= ? AND (closed_at IS NULL OR closed_at > ?) LIMIT 1")
        .get(m.id, new Date(new Date(lastTrade).getTime() + 10_000).toISOString(), lastTrade);
    return {
      missionId: m.id,
      // Minutos desde su última operación hasta el final, y si en ese tiempo tenía una posición abierta: esperar
      // con una posición no es quedarse parado (el revisor leía el antiguo "idleAtEndMinutes" como efectivo).
      minutesSinceLastTradeAtEnd: idleAtEndMinutes,
      holdingAtEnd: holding,
      parkedAtEnd: !holding && idleAtEndMinutes >= Math.max(3, durationMin * 0.25),
      succeeded: m.status === "succeeded",
      /** Misión sin objetivo: no cuenta como conseguida ni como fallida, solo su rendimiento. */
      openTarget: m.open_target === 1,
      ...(() => {
        const e = equityCurve(m.id);
        return e ? { peakPct: e.peakPct, maxDrawdownPct: e.maxDrawdownPct, ...(e.givebackPct !== undefined ? { givebackPct: e.givebackPct } : {}) } : {};
      })(),
      resultPct: Number((((m.final_usd! - m.initial_usd) / m.initial_usd) * 100).toFixed(1)),
      positions: ps.length,
      venues: [...new Set(ps.map((p) => p.venue))].join("+") || "ninguno",
      // Si la terminó él antes del plazo, con cuántos minutos por delante (si parar antes le compensa, se mide así).
      ...(() => {
        const r = db.prepare("SELECT details FROM journal WHERE mission_id = ? AND kind = 'mission' AND details LIKE '%endedByAgent%' LIMIT 1").get(m.id) as { details: string } | undefined;
        if (!r) return {};
        // Y qué hicieron después los candidatos que había visto (medido al llegar el plazo original).
        const after = (skippedCandidates(m.id) as { afterYouStopped?: unknown } | null)?.afterYouStopped as { medianChangePct: number; upMoreThan20Pct: number; measured: number } | string | undefined;
        return {
          endedByAgentMinutesLeft: (JSON.parse(r.details) as { minutesLeft: number }).minutesLeft,
          ...(after && typeof after === "object" ? { skippedAfterYouStopped: `mediana ${after.medianChangePct} %, ${after.upMoreThan20Pct} de ${after.measured} subieron +20 % o más` } : {}),
        };
      })(),
      // Qué cadenas escaneó en esa misión (no solo dónde operó): si solo mira la del dinero inicial, se ve aquí.
      scannedChains:
        [
          ...new Set(
            (db.prepare("SELECT DISTINCT target FROM research_log WHERE mission_id = ? AND tool = 'scan_market' AND target IS NOT NULL").all(m.id) as Array<{ target: string }>).flatMap(
              (r) => (r.target === "all" ? ["solana", "base", "bsc"] : [r.target]),
            ),
          ),
        ].join("+") || "ninguna",
      tokenAgeMinutes: ages.length ? ages[Math.floor(ages.length / 2)] : null,
      closedByDeadline: ps.filter((p) => String(p.exitReason ?? "").startsWith("Cierre automático")).length,
      orders,
    };
  });
  const n = perMission.length;
  const share = (f: (x: (typeof perMission)[number]) => boolean) => `${perMission.filter(f).length} de ${n}`;
  // El coste medido de entrar y salir en esas misiones (vender en el mismo instante de comprar). El agente llegó a
  // creer que costaba un 4-8 % cuando la mediana medida era del 2,1 % (v0.39.0): así lo tiene a la vista.
  const trips = missions
    .flatMap((m) => listPositions(m.id).map((p) => Number(p.research.roundTripAtEntryPct)))
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);
  const quantile = (q: number) => trips[Math.min(trips.length - 1, Math.floor(q * trips.length))]!;
  const avg = (xs: number[]) => (xs.length ? Number((xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1)) : null);
  // Éxitos seguidos al final de la serie: si el enfoque actual gana, no es estancamiento.
  // Las misiones sin objetivo no son ni éxitos ni fracasos: las estadísticas de objetivo solo cuentan las que lo tenían.
  const withTarget = perMission.filter((x) => !x.openTarget);
  let successStreak = 0;
  for (let i = withTarget.length - 1; i >= 0 && withTarget[i]!.succeeded; i--) successStreak++;
  return {
    summary: {
      missions: n,
      succeeded: `${withTarget.filter((x) => x.succeeded).length} de ${withTarget.length}` + (withTarget.length < n ? ` (y ${n - withTarget.length} sin objetivo)` : ""),
      successStreak,
      avgResultPct: Number((perMission.reduce((s, x) => s + x.resultPct, 0) / n).toFixed(1)),
      ...(trips.length ? { roundTripAtEntry: `mediana ${quantile(0.5)} %, p75 ${quantile(0.75)} % (${trips.length} compras)` } : {}),
      bestPct: Math.max(...perMission.map((x) => x.resultPct)),
      worstPct: Math.min(...perMission.map((x) => x.resultPct)),
      /** Media de lo ganado en las conseguidas y de lo perdido en las demás: cuánto pesa cada fallo frente a cada éxito. */
      avgResultPctSucceeded: avg(perMission.filter((x) => x.succeeded).map((x) => x.resultPct)),
      avgResultPctFailed: avg(withTarget.filter((x) => !x.succeeded).map((x) => x.resultPct)),
      ...(withTarget.length < n ? { avgResultPctOpenTarget: avg(perMission.filter((x) => x.openTarget).map((x) => x.resultPct)) } : {}),
      withOneEntry: share((x) => x.positions === 1),
      /** Misiones que acabaron paradas (sin operar el último cuarto del plazo) sin llegar: se rindió. */
      parkedAtEnd: share((x) => x.parkedAtEnd),
      endedByDeadline: share((x) => x.closedByDeadline > 0),
      withYoungTokens: share((x) => x.tokenAgeMinutes !== null && x.tokenAgeMinutes < 60),
      venuesUsed: [...new Set(perMission.map((x) => x.venues))].join(", "),
    },
    perMission,
  };
}

/**
 * ¿Aprende? Rendimiento de las misiones simuladas terminadas por bloques de 10 (en orden), comparado con no operar y con
 * las misiones de control (sin memoria). Si los bloques no mejoran y el control rinde igual, más tandas ya no enseñan.
 */
export const LEARNING_BLOCK = 10;
export function learningCurve() {
  const ms = db
    .prepare("SELECT id, initial_usd, final_usd, memory_off FROM missions WHERE mode = 'sim' AND status IN ('succeeded', 'expired', 'bust') AND final_usd IS NOT NULL ORDER BY id")
    .all() as Array<{ id: number; initial_usd: number; final_usd: number; memory_off: number }>;
  if (!ms.length) return { missions: 0, note: "Aún no hay misiones terminadas." };
  const row = (m: (typeof ms)[number]) => {
    const bench = (db.prepare("SELECT benchmark_usd AS b FROM snapshots WHERE mission_id = ? ORDER BY ts DESC LIMIT 1").get(m.id) as { b: number } | undefined)?.b;
    return {
      resultPct: ((m.final_usd - m.initial_usd) / m.initial_usd) * 100,
      ...(bench ? { vsNoTradePct: ((m.final_usd - bench) / m.initial_usd) * 100 } : {}),
    };
  };
  const avg = (xs: number[]) => (xs.length ? Number((xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1)) : null);
  const summarize = (list: typeof ms) => {
    const rows = list.map(row);
    return {
      missions: list.length,
      avgResultPct: avg(rows.map((r) => r.resultPct)),
      avgVsNoTradePct: avg(rows.filter((r) => r.vsNoTradePct !== undefined).map((r) => r.vsNoTradePct!)),
      positive: rows.filter((r) => r.resultPct > 0).length,
    };
  };
  const withMemory = ms.filter((m) => !m.memory_off);
  const control = ms.filter((m) => m.memory_off);
  const blocks: Array<Record<string, unknown>> = [];
  for (let i = 0; i < withMemory.length; i += LEARNING_BLOCK) {
    const slice = withMemory.slice(i, i + LEARNING_BLOCK);
    blocks.push({ block: `misiones ${slice[0]!.id}-${slice.at(-1)!.id}`, ...summarize(slice) });
  }
  const last = blocks.at(-1) as { avgResultPct: number | null; missions: number } | undefined;
  const ctrl = summarize(control);
  const verdict =
    control.length >= 2 && last && last.missions >= 5 && last.avgResultPct !== null && ctrl.avgResultPct !== null
      ? `Con memoria (último bloque) ${last.avgResultPct} % de media; sin memoria (control) ${ctrl.avgResultPct} %: ` +
        (last.avgResultPct - ctrl.avgResultPct >= 2
          ? "la memoria le ayuda."
          : last.avgResultPct - ctrl.avgResultPct <= -2
            ? "con memoria rinde PEOR: algo de lo aprendido le está perjudicando."
            : "no hay diferencia clara: la memoria todavía no marca la diferencia.")
      : "Aún no hay datos suficientes para comparar con y sin memoria (hacen falta al menos 2 misiones de control).";
  return {
    missions: ms.length,
    blocks,
    control: ctrl,
    verdict,
    note: `Una de cada ${CONTROL_EVERY} misiones simuladas se juega sin memoria (control). Bloques de ${LEARNING_BLOCK} misiones con memoria, en orden.`,
  };
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
  const full = activeCount("beliefs") >= BELIEF_LIMIT - 2 || activeCount("howtos") >= HOWTO_LIMIT - 2;
  return {
    pendingFinalReviews: pendingReviews(),
    activeMission,
    recentApproach: recentApproach(),
    learningCurve: learningCurve(),
    // Con la memoria casi llena, qué retirar con datos (no solo con el criterio del momento).
    ...(full ? { retireCandidates: retireCandidates() } : {}),
    memoryHygiene: memoryHygiene(),
    pendingObservations: db.prepare("SELECT id, ts, mission_id, kind, text FROM observations WHERE status = 'pending' ORDER BY id").all(),
    errorsWithoutHowto: recurringErrors().filter((e: any) => !e.howtoId),
    beliefsWithoutCondition,
  };
}

/** Todo lo ocurrido en una misión (desde `since` si se indica), para revisarla en una sola llamada. */
/**
 * Curva de valor de una misión (instantáneas de cada minuto): pico, caída máxima desde un pico, cuánto de lo ganado en
 * el pico se devolvió al final y, en misiones largas, el resultado por tramos. Son los datos para aprender a gestionar
 * las ganancias (cuándo guardarlas y cuándo volver a apostarlas); no hay ninguna regla aquí, solo la medida.
 */
export function equityCurve(missionId: number) {
  const m = getMission(missionId);
  if (!m) return null;
  const points = db.prepare("SELECT ts, total_usd AS v FROM snapshots WHERE mission_id = ? ORDER BY ts").all(missionId) as Array<{ ts: string; v: number }>;
  if (points.length < 2) return null;
  const start = new Date(m.started_at ?? m.created_at).getTime();
  const minutesAt = (ts: string) => Math.round((new Date(ts).getTime() - start) / 60_000);
  const pct = (a: number, b: number) => Number((((a - b) / b) * 100).toFixed(1));
  const summarize = (pts: Array<{ ts: string; v: number }>, base: number) => {
    let peak = base;
    let peakAt = pts[0]!.ts;
    let maxDrawdown = 0;
    let runPeak = base;
    for (const p of pts) {
      if (p.v > peak) {
        peak = p.v;
        peakAt = p.ts;
      }
      runPeak = Math.max(runPeak, p.v);
      maxDrawdown = Math.min(maxDrawdown, (p.v - runPeak) / runPeak);
    }
    const end = pts.at(-1)!.v;
    return {
      startUsd: Number(base.toFixed(2)),
      endUsd: Number(end.toFixed(2)),
      resultPct: pct(end, base),
      peakUsd: Number(peak.toFixed(2)),
      peakPct: pct(peak, base),
      peakAtMinute: minutesAt(peakAt),
      maxDrawdownPct: Number((maxDrawdown * 100).toFixed(1)),
      // De lo que llegó a ganar en el pico, qué parte devolvió hasta el final (100 % = lo devolvió todo).
      ...(peak > base * 1.005 ? { givebackPct: Math.round(((peak - end) / (peak - base)) * 100) } : {}),
    };
  };
  const whole = summarize(points, m.initial_usd);
  // Tramos en misiones largas: de 1 h desde 3 h de duración, de 4 h desde 12 h.
  const durationMin = (new Date(m.deadline).getTime() - start) / 60_000;
  const segmentMin = durationMin >= 12 * 60 ? 240 : durationMin >= 180 ? 60 : 0;
  const segments: Array<Record<string, unknown>> = [];
  if (segmentMin) {
    let base = m.initial_usd;
    for (let from = 0; from < durationMin; from += segmentMin) {
      const pts = points.filter((p) => {
        const t = minutesAt(p.ts);
        return t >= from && t < from + segmentMin;
      });
      if (!pts.length) continue;
      const opened = listPositions(missionId).filter((p) => {
        const t = minutesAt(p.openedAt);
        return t >= from && t < from + segmentMin;
      });
      segments.push({ fromMinute: from, toMinute: from + segmentMin, ...summarize(pts, base), entries: opened.length });
      base = pts.at(-1)!.v;
    }
  }
  return { points: points.length, ...whole, ...(segments.length ? { segments } : {}) };
}

export function missionReviewData(missionId: number, since?: string) {
  const m = getMission(missionId);
  if (!m) throw new Error(`No existe la misión #${missionId}`);
  const from = since ?? "";
  const { benchmark: _b, benchmark_sol_price: _s, ...mission } = m as Mission & { benchmark?: unknown; benchmark_sol_price?: unknown };
  const briefing = db.prepare("SELECT text, updated_at, seen_at FROM briefings WHERE mission_id = ?").get(missionId) as
    | { text: string; updated_at: string; seen_at: string | null }
    | undefined;
  const errors = db.prepare("SELECT id, ts, tool, error_class, message, howto_id FROM tool_errors WHERE mission_id = ? AND ts > ? ORDER BY id").all(missionId, from) as Array<
    Record<string, unknown> & { error_class: string; message: string }
  >;
  // A mitad de misión (since), solo lo nuevo: el revisor ya leyó el resto en su revisión anterior. Las
  // posiciones abiertas antes siguen saliendo (su estado importa), pero sin la tesis ni los datos de entrada.
  const allPositions = listPositions(missionId);
  const positions = since
    ? allPositions
        .filter((p) => p.status === "open" || p.openedAt > from || (p.closedAt ?? "") > from)
        .map((p) => (p.openedAt > from ? p : { ...p, thesis: undefined, lessonsApplied: undefined, entry: undefined, research: undefined, note: "abierta antes de tu última revisión" }))
    : allPositions;
  return {
    mission: { ...mission, profile: describe(profile(m)) },
    stats: missionStats(missionId),
    // Curva de valor: pico, caída máxima, lo devuelto desde el pico y, en misiones largas, por tramos.
    equity: equityCurve(missionId),
    // Lo que vio en los escaneos y no compró, y cómo le fue hasta el final.
    skippedCandidates: skippedCandidates(missionId),
    briefing: !briefing
      ? null
      : since && briefing.updated_at <= from
        ? { updated_at: briefing.updated_at, seen_at: briefing.seen_at, text: "(sin cambios desde tu última revisión)" }
        : briefing,
    ...(since
      ? { checkpoints: `${(db.prepare("SELECT COUNT(*) AS n FROM review_checkpoints WHERE mission_id = ?").get(missionId) as { n: number }).n} revisiones anteriores` }
      : { checkpoints: db.prepare("SELECT ts, summary FROM review_checkpoints WHERE mission_id = ? ORDER BY id").all(missionId) }),
    positions,
    ...(since && positions.length < allPositions.length ? { positionsNote: `${allPositions.length - positions.length} posiciones cerradas antes de tu última revisión no salen` } : {}),
    journal: db.prepare("SELECT ts, kind, summary, reasoning, details FROM journal WHERE mission_id = ? AND ts > ? ORDER BY id LIMIT 400").all(missionId, from),
    workLog: db
      .prepare("SELECT ts, kind, title FROM activity WHERE mission_id = ? AND ts > ? AND kind IN ('thought', 'text') ORDER BY id LIMIT 300")
      .all(missionId, from),
    notes: db.prepare("SELECT ts, text FROM notes WHERE mission_id = ? AND ts > ? ORDER BY id").all(missionId, from),
    // Las pendientes siempre (hay que procesarlas); las ya resueltas, solo si son nuevas.
    observations: db
      .prepare("SELECT id, ts, kind, text, status FROM observations WHERE mission_id = ? AND (status = 'pending' OR ts > ?) ORDER BY id")
      .all(missionId, from),
    // El mensaje solo si dice algo más que su clase normalizada.
    toolErrors: errors.map(({ error_class, message, ...e }) => ({
      ...e,
      error: error_class,
      ...(message && message !== error_class && !message.startsWith(error_class) ? { message: message.length > 240 ? message.slice(0, 240) + "…" : message } : {}),
    })),
  };
}

/**
 * Todo lo que necesita una revisión a mitad de misión, en una sola respuesta: lo nuevo desde la última
 * revisión, las creencias que tocan las posiciones nuevas (las aplicadas y las que cumplen por sus datos
 * de entrada) con su evidencia de ahora, los howtos por título y los errores repetidos sin howto.
 * Así cada relanzamiento del revisor no vuelve a leer la cola entera ni el catálogo de memoria.
 */
export function checkpointData(missionId: number) {
  const m = getMission(missionId);
  if (!m) throw new Error(`No existe la misión #${missionId}`);
  const since = lastCheckpoint(missionId) ?? m.created_at;
  const data = missionReviewData(missionId, since);
  const touched = new Set<number>();
  for (const p of data.positions.filter((x) => x.openedAt > since)) {
    for (const id of p.beliefsApplied ?? []) touched.add(id);
    const f = beliefsFor(p.venue, (p.entry ?? {}) as Record<string, unknown>, p.asset, (p.research ?? {}) as Record<string, unknown>);
    for (const id of [...f.block, ...f.caution, ...f.favor]) touched.add(id);
  }
  const mem = recall(missionId);
  return {
    since,
    ...data,
    memory: {
      howtos: mem.howtos.map((h) => `#${h.id} [${h.scope}/${h.topic}] ${h.title}`),
      beliefsTouched: mem.beliefs
        .filter((b) => touched.has(b.id))
        .map((b) => ({ id: b.id, statement: clip(b.statement, 200), ...(b.condition ? { condition: b.condition, expectation: b.expectation } : {}), evidence: b.evidence.verdict })),
      otherBeliefs: `${mem.totalBeliefs - touched.size} creencias más, sin relación con las posiciones nuevas (memory_catalog si necesitas alguna)`,
    },
    errorsWithoutHowto: (recurringErrors() as Array<Record<string, unknown>>).filter((e) => !e.howtoId).slice(0, 5),
    note:
      "Todo lo de esta revisión: no hace falta review_queue, mission_review_data ni memory_catalog. El detalle de una creencia o un " +
      "howto concreto, con memory_catalog y belief_ids/howto_ids. Al terminar, review_checkpoint.",
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

/**
 * El howto que el revisor ya enlazó a este tipo de error (mismo error_class), si lo hay: se le enseña al agente en
 * el momento en que el error se repite. Los howtos le llegan por título al empezar y no siempre los relee; en
 * M32-M35 repitió cuatro veces un error que su howto #6 ya explicaba.
 */
export function howtoForError(message: string): { id: number; title: string; steps: string } | undefined {
  const row = db
    // Por el principio del mensaje: el resto lleva el símbolo del token y cambia de un error a otro del mismo tipo.
    .prepare("SELECT h.id, h.title, h.steps FROM tool_errors e JOIN howtos h ON h.id = e.howto_id WHERE substr(e.error_class, 1, 50) = ? AND h.status = 'active' ORDER BY e.id DESC LIMIT 1")
    .get(errorClass(message).slice(0, 50)) as { id: number; title: string; steps: string } | undefined;
  return row;
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
