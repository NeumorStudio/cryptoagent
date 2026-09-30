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
  /** Lo más alto y lo más bajo que llegó mientras la tenía (cierres de cada minuto), sobre el precio de entrada. */
  bestWhileHeldPct?: number;
  worstWhileHeldPct?: number;
  /** Lo más alto dentro de cada minuto mientras la tenía: puede ser un pico de segundos que no se podía vender. */
  highWhileHeldPct?: number;
  /** Si la hubiera mantenido 15 o 30 minutos más (sobre el precio de entrada). */
  ifHeld15Pct?: number;
  ifHeld30Pct?: number;
  reading?: string;
  unavailable?: string;
  /** El precio del pool se aleja mucho del resultado real: sus máximos y "habría dado" no eran vendibles. */
  unreliable?: string;
}

const cache = new Map<number, Counterfactual>();
const pct = (a: number, b: number, decimals = 1) => Number(((b / a - 1) * 100).toFixed(decimals));

async function candles(venue: string, token: string, fromSec: number, toSec: number): Promise<Array<[number, number, number, number, number]>> {
  const net = NETWORK[venue];
  if (!net) throw new Error("cadena sin datos de velas");
  const pools = await fetchJson<{ data: Array<{ attributes: { address: string; reserve_in_usd?: string } }> }>(`https://api.geckoterminal.com/api/v2/networks/${net}/tokens/${token}/pools?page=1`, {
    ttlMs: 3_600_000,
  });
  // El pool con más liquidez: el primero de la lista puede ser uno pequeño (o manipulado) que no es donde se opera.
  const pool = [...pools.data].sort((a, b) => Number(b.attributes.reserve_in_usd ?? 0) - Number(a.attributes.reserve_in_usd ?? 0))[0]?.attributes.address;
  if (!pool) throw new Error("sin pool en GeckoTerminal");
  const limit = Math.min(1000, Math.ceil((toSec - fromSec) / 60) + 3);
  const res = await fetchJson<{ data: { attributes: { ohlcv_list: Array<[number, number, number, number, number]> } } }>(
    `https://api.geckoterminal.com/api/v2/networks/${net}/pools/${pool}/ohlcv/minute?aggregate=1&limit=${limit}&before_timestamp=${toSec}&currency=usd&token=${token}`,
    { ttlMs: 600_000 },
  );
  return [...res.data.attributes.ohlcv_list].sort((a, b) => a[0] - b[0]);
}

/** Velas de 1 min del subyacente de un futuro en Binance (SOL, ETH, BNB…), en segundos como las de GeckoTerminal. */
async function perpCandles(coin: string, fromSec: number, toSec: number): Promise<Array<[number, number, number, number, number]>> {
  const limit = Math.min(1000, Math.ceil((toSec - fromSec) / 60) + 3);
  const raw = await fetchJson<Array<[number, string, string, string, string]>>(
    `https://api.binance.com/api/v3/klines?symbol=${coin.toUpperCase()}USDT&interval=1m&startTime=${fromSec * 1000}&endTime=${toSec * 1000}&limit=${limit}`,
    { ttlMs: 600_000 },
  );
  return raw.map((k) => [Math.floor(k[0] / 1000), Number(k[1]), Number(k[2]), Number(k[3]), Number(k[4])]);
}

/**
 * Precio en el instante `sec`, sin mirar al futuro: el cierre de la última vela ya terminada o, si `sec` cae en la
 * primera, su apertura. Antes se tomaba el cierre de la vela en curso, que llega hasta un minuto después: en una
 * operación de segundos la entrada y la salida salían iguales (fableroom, M11 de la v0.39.0: "0 % de movimiento"
 * en un minuto en que la curva subió un 45 %).
 */
const priceAt = (cs: Array<[number, number, number, number, number]>, sec: number) => {
  let p: number | undefined;
  for (const c of cs) {
    if (c[0] + 60 <= sec) p = c[4];
    else if (c[0] <= sec) p ??= c[1];
  }
  return p;
};
/** Una operación más corta que esto no se puede medir con velas de 1 minuto. */
const MIN_MEASURABLE_SEC = 120;

async function one(p: Pos): Promise<Counterfactual> {
  const base: Counterfactual = { positionId: p.id, symbol: p.symbol, actualPct: p.pnlPct ?? null };
  // Futuros: el símbolo es "SOL-PERP largo 20x". Los porcentajes van en el sentido de la posición (en un corto,
  // que baje el precio es a favor) y sobre el precio, sin apalancar.
  const perp = p.venue === "hyperliquid" ? p.symbol.match(/^(\w+)-PERP (largo|corto) (\d+)x/) : null;
  if (!p.closedAt || (!NETWORK[p.venue] && !perp)) return { ...base, unavailable: "sin datos de precio para esta cadena" };
  const open = Math.floor(new Date(p.openedAt).getTime() / 1000);
  const close = Math.floor(new Date(p.closedAt).getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);
  const end = Math.min(now, close + 30 * 60);
  const raw = perp ? await perpCandles(perp[1]!, open - 120, end) : await candles(p.venue, p.asset, open - 120, end);
  // En un corto se invierten las velas (1/precio): así "subir" siempre es a favor y el resto no cambia.
  const cs = perp?.[2] === "corto" ? raw.map(([t, o, h, l, c]) => [t, 1 / o, 1 / l, 1 / h, 1 / c] as [number, number, number, number, number]) : raw;
  const entry = priceAt(cs, open) ?? cs[0]?.[4];
  const exit = priceAt(cs, close);
  if (!entry || !exit) return { ...base, unavailable: "sin velas en ese intervalo" };
  // Cierres de los minutos terminados mientras la tenía, y máximos de los minutos que tocó.
  const held = cs.filter((c) => c[0] + 60 > open && c[0] + 60 <= close);
  const touched = cs.filter((c) => c[0] + 60 > open && c[0] <= close);
  const shortTrade = close - open < MIN_MEASURABLE_SEC;
  const at15 = close + 15 * 60 <= now ? priceAt(cs, close + 15 * 60) : undefined;
  const at30 = close + 30 * 60 <= now ? priceAt(cs, close + 30 * 60) : undefined;
  const d = perp ? 2 : 1;
  const out: Counterfactual = {
    ...base,
    marketMovePct: pct(entry, exit, d),
    // Con los cierres de cada minuto, no con los máximos y mínimos: en pools pequeños las mechas son picos de un
    // segundo que no se podían vender (en la M28, p/acc "llegó a +66 %" justo antes de un rug del -95 %).
    bestWhileHeldPct: held.length ? pct(entry, Math.max(...held.map((c) => c[4])), d) : undefined,
    worstWhileHeldPct: held.length ? pct(entry, Math.min(...held.map((c) => c[4])), d) : undefined,
    highWhileHeldPct: touched.length ? pct(entry, Math.max(...touched.map((c) => c[2])), d) : undefined,
    ifHeld15Pct: at15 ? pct(entry, at15, d) : undefined,
    ifHeld30Pct: at30 ? pct(entry, at30, d) : undefined,
  };
  const notes: string[] = [];
  if (out.bestWhileHeldPct !== undefined && out.marketMovePct !== undefined && out.bestWhileHeldPct >= 3 && out.bestWhileHeldPct - out.marketMovePct >= 20) {
    notes.push(`llegó a +${out.bestWhileHeldPct} % mientras la tenía y salió en ${out.marketMovePct} %: la salida dejó dinero en la mesa`);
  }
  if (out.ifHeld15Pct !== undefined && out.marketMovePct !== undefined && out.ifHeld15Pct > out.marketMovePct + 30) {
    notes.push(`a los 15 min de vender iba ${out.ifHeld15Pct} %`);
  }
  if (out.ifHeld30Pct !== undefined && out.marketMovePct !== undefined) {
    if (out.ifHeld30Pct < out.marketMovePct - 15) notes.push(`mantenerla 30 min más habría dado ${out.ifHeld30Pct} %: la salida fue buena`);
    else if (out.ifHeld30Pct > out.marketMovePct + 15) notes.push(`mantenerla 30 min más habría dado ${out.ifHeld30Pct} %: salió demasiado pronto`);
  }
  if (!shortTrade && out.bestWhileHeldPct !== undefined && out.bestWhileHeldPct < (perp ? 0.1 : 3) && (p.pnlPct ?? 0) < 0) {
    notes.push("nunca llegó a ir en positivo: el problema fue la entrada, no la salida");
  }
  if (out.highWhileHeldPct !== undefined && out.highWhileHeldPct >= 10) notes.push(`dentro del minuto llegó a +${out.highWhileHeldPct} % (puede ser un pico no vendible)`);
  if (perp) notes.push(`futuro a ${perp[3]}x: los % son del precio en el sentido de la posición; sobre el margen, por ${perp[3]}`);
  // Si el precio del pool no cuadra con lo que dio la venta real (rug, pool distinto o mucho impacto), sus
  // "llegó a" y "habría dado" no eran precios a los que se pudiera vender: se avisa para no juzgar la salida con ellos.
  if (shortTrade) {
    out.unreliable = `operación de ${close - open} s: las velas de 1 min no la miden (entrada, salida y máximos pueden no corresponder)`;
    notes.unshift("lectura poco fiable, ver unreliable");
  } else if (out.marketMovePct !== undefined && base.actualPct !== null && Math.abs(out.marketMovePct - base.actualPct) > 15) {
    out.unreliable = `el precio del pool (${out.marketMovePct} %) no cuadra con la venta real (${base.actualPct} %): no eran precios de venta`;
    notes.unshift("lectura poco fiable, ver unreliable");
  }
  out.reading = notes.join("; ") || "sin nada destacable";
  if (at30 !== undefined) cache.set(p.id, out); // completa: ya no cambia
  return out;
}

/** Contrafactuales de las operaciones cerradas de una misión (como mucho `limit`, las más recientes). */
export async function missionCounterfactuals(missionId: number, limit = 8): Promise<Counterfactual[]> {
  const closed = listPositions(missionId)
    .filter((p) => p.status === "closed")
    .slice(0, limit); // listPositions viene de la más nueva a la más antigua
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
