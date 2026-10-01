// Encaje de estrategias: con lo que falta para el objetivo y el tiempo que queda, qué estrategia puede
// llegar y con qué riesgo. Lo calcula el simulador con datos reales, no el agente "a ojo":
// - cripto grande al contado y futuros: con la volatilidad real de los últimos minutos (Binance);
// - memecoins: con el historial de las propias operaciones del agente.
// Es una estimación (movimiento aleatorio sin tendencia, principio de reflexión), pero ordena bien: pedir
// un +10 % a SOL en 15 min es casi imposible; con futuros a 10x basta un +1 %, a cambio de liquidación.
import * as binance from "../market/binance.js";
import { perpMarkets } from "../market/hyperliquid.js";
import { PERP_DEPOSIT_FEE_USD, PERP_TAKER_FEE, PERP_WITHDRAW_FEE_USD } from "./perps.js";
import { getMission, type Mission } from "./mission.js";
import { valuation } from "./portfolio.js";
import { listPositions } from "./positions.js";

const MAJORS = ["SOL", "ETH", "BNB"] as const;
const LEVERAGES = [5, 10, 20];

/** Φ, la normal estándar acumulada (aproximación de Abramowitz-Stegun). */
function phi(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/** Probabilidad de que un precio sin tendencia toque un nivel a `a` (en log) en un tiempo con desviación `s`. */
export const probTouch = (a: number, s: number) => (a <= 0 ? 1 : s <= 0 ? 0 : Math.min(1, 2 * (1 - phi(a / s))));

/** Desviación por minuto de los rendimientos logarítmicos (velas de 1 min de las últimas horas) y cambio en la última hora. */
async function volatility(symbol: string): Promise<{ sigma: number; change1hPct: number }> {
  const k = await binance.klines(symbol, "1m", 240);
  const r = k.slice(1).map((c, i) => Math.log(c[4] / k[i]![4]));
  const mean = r.reduce((s, x) => s + x, 0) / r.length;
  const sigma = Math.sqrt(r.reduce((s, x) => s + (x - mean) ** 2, 0) / (r.length - 1));
  const last = k.at(-1)![4];
  const hourAgo = k.at(-61)?.[4] ?? k[0]![4];
  return { sigma, change1hPct: Number(((last / hourAgo - 1) * 100).toFixed(2)) };
}

const pct = (p: number) => Math.round(p * 100);
const label = (p: number) => (p >= 0.25 ? "encaja" : p >= 0.05 ? "posible" : "no encaja");

/**
 * Movimiento del precio (fracción) que necesita un futuro con toda la cartera como margen para llegar al
 * objetivo, contando el depósito, la retirada y la comisión de apertura y cierre sobre el nocional.
 */
export function perpMoveNeeded(totalUsd: number, targetUsd: number, leverage: number): number {
  const margin = Math.max(1, totalUsd - PERP_DEPOSIT_FEE_USD);
  return (targetUsd - totalUsd + PERP_DEPOSIT_FEE_USD + PERP_WITHDRAW_FEE_USD) / (margin * leverage) + 2 * PERP_TAKER_FEE;
}

export interface FitRow {
  strategy: string;
  /** Probabilidad estimada de llegar al objetivo en el tiempo que queda (%). */
  reachTargetPct: number | null;
  /** Riesgo de ruina o de pérdida grande (%), si aplica. */
  ruinPct?: number | null;
  fit: "encaja" | "posible" | "no encaja" | "sin datos" | "sin objetivo";
  basis: string;
  available: boolean;
}

export async function strategyFit(missionOrId: Mission | number) {
  const mission = typeof missionOrId === "number" ? getMission(missionOrId)! : missionOrId;
  const v = await valuation(mission.id);
  const minutesLeft = Math.max(1, (new Date(mission.deadline).getTime() - Date.now()) / 60_000);
  // Sin objetivo no hay una probabilidad de llegar que calcular: se dan el recorrido típico y el riesgo de cada una.
  const open = mission.open_target === 1;
  const need = open ? 0 : mission.target_usd / v.totalUsd - 1;
  const a = Math.log(1 + Math.max(need, 0));
  const rows: FitRow[] = [];

  // Cripto grande al contado y con futuros (solo los apalancamientos que permite Hyperliquid para cada moneda).
  const perpMax = await perpMarkets().then(
    (m) => new Map([...m.values()].map((x) => [x.coin, x.maxLeverage])),
    () => new Map<string, number>(),
  );
  for (const sym of MAJORS) {
    const vol = await volatility(`${sym}USDT`).catch(() => null);
    if (vol === null) continue;
    const s = vol.sigma * Math.sqrt(minutesLeft);
    const spot = probTouch(a, s);
    rows.push({
      strategy: `${sym} al contado`,
      reachTargetPct: open ? null : pct(spot),
      fit: open ? "sin objetivo" : label(spot),
      basis: `movimiento típico en ${Math.round(minutesLeft)} min: ±${(s * 100).toFixed(2)} %; última hora: ${vol.change1hPct > 0 ? "+" : ""}${vol.change1hPct} %`,
      available: true,
    });
    const maxLev = perpMax.get(sym) ?? 0;
    for (const lev of LEVERAGES.filter((l) => l <= maxLev)) {
      // Con todo como margen (menos el depósito), el movimiento necesario cubre lo que falta más los costes
      // fijos (depósito y retirada) y la comisión de apertura y cierre sobre el nocional: sin ellos, a 20x
      // parecía que bastaba un +0,5 % cuando hacía falta un +0,75 %. La liquidación llega cuando la pérdida
      // se come el margen hasta el mantenimiento: 1/L − 1/(2·apalancamiento máximo de la moneda).
      const margin = Math.max(1, v.totalUsd - PERP_DEPOSIT_FEE_USD);
      const needMove = perpMoveNeeded(v.totalUsd, mission.target_usd, lev);
      const move = Math.log(1 + Math.max(needMove, 0));
      const liqDistance = 1 / lev - 1 / (2 * maxLev);
      const liq = -Math.log(1 - liqDistance);
      const reach = probTouch(move, s);
      const ruin = probTouch(liq, s);
      rows.push({
        strategy: `Futuros ${sym} ${lev}x`,
        reachTargetPct: open ? null : pct(reach),
        ruinPct: pct(ruin),
        fit: open ? "sin objetivo" : label(reach * (1 - ruin)),
        basis: open
          ? `movimiento típico con ${lev}x: ±${(s * lev * 100).toFixed(1)} % de la cartera; liquidación a ~${(liqDistance * 100).toFixed(1)} % en contra; open_perp`
          : `necesita ${(needMove * 100).toFixed(2)} % a favor contando costes (~${(PERP_DEPOSIT_FEE_USD + PERP_WITHDRAW_FEE_USD + 2 * PERP_TAKER_FEE * margin * lev).toFixed(2)} $); liquidación a ~${(liqDistance * 100).toFixed(1)} % en contra; open_perp`,
        available: true,
      });
    }
  }

  // Memecoins jóvenes: con el historial propio.
  const closed = listPositions().filter((p) => p.status === "closed" && (p.entry.ageMinutes ?? Infinity) < 60 && p.pnlPct !== null);
  if (closed.length >= 5) {
    const hit = closed.filter((p) => (p.pnlPct ?? 0) >= need * 100).length / closed.length;
    const ruin = closed.filter((p) => (p.pnlPct ?? 0) <= -50).length / closed.length;
    const sorted = closed.map((p) => p.pnlPct ?? 0).sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    const winners = sorted.filter((x) => x > 0).length / sorted.length;
    rows.push({
      strategy: "Memecoin joven (< 60 min)",
      reachTargetPct: open ? null : pct(hit),
      ruinPct: pct(ruin),
      fit: open ? "sin objetivo" : label(hit),
      basis: open
        ? `tus ${closed.length} operaciones: mediana ${median > 0 ? "+" : ""}${median.toFixed(0)} %, ${pct(winners)} % en ganancias y ${pct(ruin)} % perdieron la mitad o más`
        : `tus ${closed.length} operaciones: ${pct(hit)} % dieron +${(need * 100).toFixed(0)} % o más en una sola operación y ${pct(ruin)} % perdieron la mitad o más` +
        (hit < 0.05 && need > 0.3 ? "; con un objetivo así, solo encadenando varias ganadoras" : ""),
      available: true,
    });
  } else {
    rows.push({ strategy: "Memecoin joven (< 60 min)", reachTargetPct: null, fit: "sin datos", basis: "menos de 5 operaciones propias", available: true });
  }

  rows.sort((x, y) => (y.reachTargetPct ?? -1) * (1 - (y.ruinPct ?? 0) / 100) - (x.reachTargetPct ?? -1) * (1 - (x.ruinPct ?? 0) / 100));
  if (open) {
    return {
      goal: "sin objetivo: el máximo rendimiento al final del plazo",
      minutesLeft: Math.round(minutesLeft),
      note:
        "Misión sin objetivo: no hay probabilidad de llegar que calcular. Para cada estrategia, el recorrido típico en el tiempo que queda " +
        "(cripto grande) o tu historial (memecoins), y el riesgo de ruina. Sirve para comparar cuánto puede dar cada una y cuánto arriesga.",
      strategies: rows,
    };
  }
  return {
    needPct: Number((need * 100).toFixed(1)),
    minutesLeft: Math.round(minutesLeft),
    note:
      "Estimación del simulador: probabilidad de tocar el objetivo en el tiempo que queda, con la volatilidad real (cripto grande) o con " +
      "tu historial (memecoins). No es una predicción: sirve para descartar lo que no encaja con la misión y comparar riesgos. " +
      "available: false = aún no se puede ejecutar en el simulador.",
    strategies: rows,
  };
}
