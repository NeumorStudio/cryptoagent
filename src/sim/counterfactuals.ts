// "Qué habría pasado si…" de cada operación cerrada, con el precio real minuto a minuto (GeckoTerminal):
// cuánto llegó a subir mientras la tenía, cuánto habría ganado o perdido manteniéndola 15 o 30 minutos
// más, y el resultado de no haber entrado (0 %). Así el revisor separa una mala entrada de una mala salida
// y no juzga solo por el resultado (sesgo retrospectivo).
import { fetchJson } from "../market/http.js";
import { listPositions } from "./positions.js";

const NETWORK: Record<string, string> = { solana: "solana", base: "base", bsc: "bsc" };
type Pos = ReturnType<typeof listPositions>[number];

export interface Counterfactual {
  positionId: number;
  symbol: string;
  /** Resultado real de la operación (con comisiones y slippage). */
  actualPct: number | null;
  /** Movimiento del precio de mercado entre la entrada y la salida. */
  marketMovePct?: number;
  /** Lo más alto y lo más bajo que llegó mientras la tenía, sobre el precio de entrada. */
  bestWhileHeldPct?: number;
  worstWhileHeldPct?: number;
  /** Si la hubiera mantenido 15 o 30 minutos más (sobre el precio de entrada). */
  ifHeld15Pct?: number;
  ifHeld30Pct?: number;
  reading?: string;
  unavailable?: string;
}

const cache = new Map<number, Counterfactual>();
const pct = (a: number, b: number) => Number(((b / a - 1) * 100).toFixed(1));

async function candles(venue: string, token: string, fromSec: number, toSec: number): Promise<Array<[number, number, number, number, number]>> {
  const net = NETWORK[venue];
  if (!net) throw new Error("cadena sin datos de velas");
  const pools = await fetchJson<{ data: Array<{ attributes: { address: string } }> }>(`https://api.geckoterminal.com/api/v2/networks/${net}/tokens/${token}/pools?page=1`, {
    ttlMs: 3_600_000,
  });
  const pool = pools.data[0]?.attributes.address;
  if (!pool) throw new Error("sin pool en GeckoTerminal");
  const limit = Math.min(1000, Math.ceil((toSec - fromSec) / 60) + 3);
  const res = await fetchJson<{ data: { attributes: { ohlcv_list: Array<[number, number, number, number, number]> } } }>(
    `https://api.geckoterminal.com/api/v2/networks/${net}/pools/${pool}/ohlcv/minute?aggregate=1&limit=${limit}&before_timestamp=${toSec}&currency=usd&token=${token}`,
    { ttlMs: 600_000 },
  );
  return [...res.data.attributes.ohlcv_list].sort((a, b) => a[0] - b[0]);
}

/** Precio de cierre de la última vela en o antes de `sec`. */
const priceAt = (cs: Array<[number, number, number, number, number]>, sec: number) => {
  let p: number | undefined;
  for (const c of cs) if (c[0] <= sec) p = c[4];
  return p;
};

async function one(p: Pos): Promise<Counterfactual> {
  const base: Counterfactual = { positionId: p.id, symbol: p.symbol, actualPct: p.pnlPct ?? null };
  if (!p.closedAt || !NETWORK[p.venue]) return { ...base, unavailable: "sin datos de precio para esta cadena" };
  const open = Math.floor(new Date(p.openedAt).getTime() / 1000);
  const close = Math.floor(new Date(p.closedAt).getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);
  const end = Math.min(now, close + 30 * 60);
  const cs = await candles(p.venue, p.asset, open - 120, end);
  const entry = priceAt(cs, open) ?? cs[0]?.[4];
  const exit = priceAt(cs, close);
  if (!entry || !exit) return { ...base, unavailable: "sin velas en ese intervalo" };
  const held = cs.filter((c) => c[0] >= open - 60 && c[0] <= close);
  const at15 = close + 15 * 60 <= now ? priceAt(cs, close + 15 * 60) : undefined;
  const at30 = close + 30 * 60 <= now ? priceAt(cs, close + 30 * 60) : undefined;
  const out: Counterfactual = {
    ...base,
    marketMovePct: pct(entry, exit),
    bestWhileHeldPct: held.length ? pct(entry, Math.max(...held.map((c) => c[2]))) : undefined,
    worstWhileHeldPct: held.length ? pct(entry, Math.min(...held.map((c) => c[3]))) : undefined,
    ifHeld15Pct: at15 ? pct(entry, at15) : undefined,
    ifHeld30Pct: at30 ? pct(entry, at30) : undefined,
  };
  const notes: string[] = [];
  if (out.bestWhileHeldPct !== undefined && out.marketMovePct !== undefined && out.bestWhileHeldPct - out.marketMovePct >= 20) {
    notes.push(`llegó a +${out.bestWhileHeldPct} % mientras la tenía y salió en ${out.marketMovePct} %: la salida dejó dinero en la mesa`);
  }
  if (out.ifHeld15Pct !== undefined && out.marketMovePct !== undefined && out.ifHeld15Pct > out.marketMovePct + 30) {
    notes.push(`a los 15 min de vender iba ${out.ifHeld15Pct} %`);
  }
  if (out.ifHeld30Pct !== undefined && out.marketMovePct !== undefined) {
    if (out.ifHeld30Pct < out.marketMovePct - 15) notes.push(`mantenerla 30 min más habría dado ${out.ifHeld30Pct} %: la salida fue buena`);
    else if (out.ifHeld30Pct > out.marketMovePct + 15) notes.push(`mantenerla 30 min más habría dado ${out.ifHeld30Pct} %: salió demasiado pronto`);
  }
  if (out.bestWhileHeldPct !== undefined && out.bestWhileHeldPct < 3 && (p.pnlPct ?? 0) < 0) notes.push("nunca llegó a ir en positivo: el problema fue la entrada, no la salida");
  out.reading = notes.join("; ") || "sin nada destacable";
  if (at30 !== undefined) cache.set(p.id, out); // completa: ya no cambia
  return out;
}

/** Contrafactuales de las operaciones cerradas de una misión (como mucho `limit`, las más recientes). */
export async function missionCounterfactuals(missionId: number, limit = 8): Promise<Counterfactual[]> {
  const closed = listPositions(missionId)
    .filter((p) => p.status === "closed")
    .slice(-limit);
  const out: Counterfactual[] = [];
  for (const p of closed) {
    const cached = cache.get(p.id);
    if (cached) {
      out.push(cached);
      continue;
    }
    out.push(await one(p).catch((err) => ({ positionId: p.id, symbol: p.symbol, actualPct: p.pnlPct ?? null, unavailable: (err as Error).message.slice(0, 120) })));
  }
  return out;
}
