// "Qué habría pasado si…" de cada operación cerrada, con el precio real minuto a minuto (GeckoTerminal):
// cuánto llegó a subir mientras la tenía, cuánto habría ganado o perdido manteniéndola 15 o 30 minutos
// más, y el resultado de no haber entrado (0 %). Así el revisor separa una mala entrada de una mala salida
// y no juzga solo por el resultado (sesgo retrospectivo).
import { db } from "../db.js";
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
  /**
   * Lo más bajo dentro de cada minuto mientras la tenía. Para la bajada sí cuenta la mecha: es donde salta un stop.
   * Con los cierres, en la M21 CATE "nunca bajó del -0,6 %" y el revisor leyó que el stop del -4 % saltó por ruido.
   */
  lowWhileHeldPct?: number;
  /** Si la hubiera mantenido 15 o 30 minutos más (sobre el precio de entrada). */
  ifHeld15Pct?: number;
  ifHeld30Pct?: number;
  reading?: string;
  unavailable?: string;
  /** El precio del pool se aleja mucho del resultado real: sus máximos y "habría dado" no eran vendibles. */
  unreliable?: string;
}

const cache = new Map<number, Counterfactual>();

/** El stop más ajustado que tuvo la posición y no llegó a saltar, en % sobre el precio de entrada de las velas. */
function untriggeredStopPct(p: Pos, entry: number): number | undefined {
  if (!entry) return undefined;
  const rows = db
    .prepare(
      `SELECT trigger_price FROM orders WHERE mission_id = ? AND venue = ? AND trigger_asset = ? AND condition = 'below' AND status != 'filled'
         AND created_at >= ? AND created_at <= ?`,
    )
    .all(p.missionId, p.venue, p.asset, p.openedAt, p.closedAt ?? p.openedAt) as Array<{ trigger_price: number }>;
  if (!rows.length) return undefined;
  const highest = Math.max(...rows.map((r) => r.trigger_price));
  return Number(((highest / entry - 1) * 100).toFixed(1));
}

/** Coste medido de entrar y salir de la posición (si se midió); si no, un 3 % por defecto. */
const roundTrip = (p: Pos) => {
  const r = Number((p.research as Record<string, unknown> | undefined)?.roundTripAtEntryPct);
  return Number.isFinite(r) ? Math.abs(r) : 3;
};
const pct = (a: number, b: number, decimals = 1) => Number(((b / a - 1) * 100).toFixed(decimals));

/** Campos de la curva de una posición que se guardan en su `research` para que las creencias puedan condicionar. */
const PATH_FIELDS = ["marketMovePct", "bestWhileHeldPct", "worstWhileHeldPct", "highWhileHeldPct", "lowWhileHeldPct"] as const;

/**
 * Guarda en la posición los datos de su curva (pico, valle y movimiento), calculados al revisar. Así las
 * creencias pueden condicionar sobre la gestión de la salida (p. ej. "cuando llegó a +X % y la dejé caer").
 */
function persistPathFeatures(p: Pos, cf: Counterfactual) {
  const row = db.prepare("SELECT research FROM positions WHERE id = ?").get(p.id) as { research: string | null } | undefined;
  if (!row) return;
  const research = JSON.parse(row.research ?? "{}") as Record<string, unknown>;
  let changed = false;
  for (const k of PATH_FIELDS) {
    const v = cf[k];
    if (v !== undefined && research[k] !== v) {
      research[k] = v;
      changed = true;
    }
  }
  if (changed) db.prepare("UPDATE positions SET research = ? WHERE id = ?").run(JSON.stringify(research), p.id);
}

/** El pool con más liquidez del token en GeckoTerminal (el primero de la lista puede ser pequeño o manipulado). */
async function resolvePool(net: string, token: string): Promise<string> {
  const pools = await fetchJson<{ data: Array<{ attributes: { address: string; reserve_in_usd?: string } }> }>(
    `https://api.geckoterminal.com/api/v2/networks/${net}/tokens/${token}/pools?page=1`,
    { ttlMs: 3_600_000 },
  );
  const pool = [...pools.data].sort((a, b) => Number(b.attributes.reserve_in_usd ?? 0) - Number(a.attributes.reserve_in_usd ?? 0))[0]?.attributes.address;
  if (!pool) throw new Error("sin pool en GeckoTerminal");
  return pool;
}

async function candles(venue: string, token: string, fromSec: number, toSec: number): Promise<Array<[number, number, number, number, number]>> {
  const net = NETWORK[venue];
  if (!net) throw new Error("cadena sin datos de velas");
  const pool = await resolvePool(net, token);
  const limit = Math.min(1000, Math.ceil((toSec - fromSec) / 60) + 3);
  const res = await fetchJson<{ data: { attributes: { ohlcv_list: Array<[number, number, number, number, number]> } } }>(
    `https://api.geckoterminal.com/api/v2/networks/${net}/pools/${pool}/ohlcv/minute?aggregate=1&limit=${limit}&before_timestamp=${toSec}&currency=usd&token=${token}`,
    { ttlMs: 600_000 },
  );
  return [...res.data.attributes.ohlcv_list].sort((a, b) => a[0] - b[0]);
}

/** Precio del token a partir de sus operaciones en el pool, segundo a segundo: [segundos, precioUSD] ordenado. */
async function tradesSeries(net: string, pool: string, token: string): Promise<Array<[number, number]>> {
  const res = await fetchJson<{ data?: Array<{ attributes?: Record<string, unknown> }> }>(
    `https://api.geckoterminal.com/api/v2/networks/${net}/pools/${pool}/trades`,
  );
  const tokenKey = token.toLowerCase();
  const out: Array<[number, number]> = [];
  for (const t of res.data ?? []) {
    const a = t.attributes ?? {};
    const ts = typeof a.block_timestamp === "string" ? new Date(a.block_timestamp).getTime() / 1000 : NaN;
    if (!Number.isFinite(ts)) continue;
    // Precio del token en USD: si es el que se envía, price_from_in_usd; si es el que se recibe, price_to_in_usd.
    const from = String(a.from_token_address ?? "").toLowerCase();
    const price = from === tokenKey ? Number(a.price_from_in_usd) : Number(a.price_to_in_usd);
    if (!Number.isFinite(price) || price <= 0) continue;
    out.push([ts, price]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** Último precio del token a `sec` (el último punto anterior o igual). */
const seriesPriceAt = (s: Array<[number, number]>, sec: number): number | undefined => {
  let p: number | undefined;
  for (const [t, price] of s) {
    if (t <= sec) p = price;
    else break;
  }
  return p;
};

/** Precio del punto más cercano en el tiempo a `sec` (antes o después). */
const seriesPriceNear = (s: Array<[number, number]>, sec: number): number | undefined => {
  let best: number | undefined;
  let bestDist = Infinity;
  for (const [t, price] of s) {
    const d = Math.abs(t - sec);
    if (d < bestDist) {
      bestDist = d;
      best = price;
    }
  }
  return best;
};

/**
 * Contrafactual de una operación corta (< 2 min) con las operaciones reales del pool (segundo a segundo), en
 * lugar de las velas de 1 min que no la miden. Devuelve null si no hay datos suficientes y hay que seguir con
 * velas (y marcarla como poco fiable).
 */
async function fineFromTrades(p: Pos, open: number, close: number): Promise<Counterfactual | null> {
  const net = NETWORK[p.venue];
  if (!net) return null;
  try {
    const pool = await resolvePool(net, p.asset);
    const series = await tradesSeries(net, pool, p.asset);
    if (series.length < 2) return null;
    const inWindow = series.filter(([t]) => t >= open && t <= close);
    if (!inWindow.length) return null;
    const entry = seriesPriceAt(series, open) ?? seriesPriceNear(series, open);
    const exit = seriesPriceAt(series, close) ?? seriesPriceNear(series, close);
    if (!entry || !exit || entry <= 0) return null;
    const prices = inWindow.map(([, pr]) => pr);
    const best = Math.max(...prices);
    const worst = Math.min(...prices);
    const now = Math.floor(Date.now() / 1000);
    const at15 = close + 15 * 60 <= now ? (seriesPriceAt(series, close + 15 * 60) ?? seriesPriceNear(series, close + 15 * 60)) : undefined;
    const at30 = close + 30 * 60 <= now ? (seriesPriceAt(series, close + 30 * 60) ?? seriesPriceNear(series, close + 30 * 60)) : undefined;
    const pct = (a: number, b: number) => Number(((b / a - 1) * 100).toFixed(1));
    const out: Counterfactual = {
      positionId: p.id,
      symbol: p.symbol,
      actualPct: p.pnlPct ?? null,
      marketMovePct: pct(entry, exit),
      bestWhileHeldPct: pct(entry, best),
      worstWhileHeldPct: pct(entry, worst),
      highWhileHeldPct: pct(entry, best),
      lowWhileHeldPct: pct(entry, worst),
      ...(at15 !== undefined ? { ifHeld15Pct: pct(entry, at15) } : {}),
      ...(at30 !== undefined ? { ifHeld30Pct: pct(entry, at30) } : {}),
    };
    const notes: string[] = [];
    if (out.bestWhileHeldPct !== undefined && out.marketMovePct !== undefined && out.bestWhileHeldPct >= 3 && out.bestWhileHeldPct - out.marketMovePct >= 20) {
      notes.push(`llegó a +${out.bestWhileHeldPct} % mientras la tenía y salió en ${out.marketMovePct} %: la salida dejó dinero en la mesa`);
    }
    if (out.ifHeld15Pct !== undefined && out.marketMovePct !== undefined && out.ifHeld15Pct > out.marketMovePct + 30) {
      notes.push(`a los 15 min de vender iba ${out.ifHeld15Pct} %`);
    }
    if (out.bestWhileHeldPct !== undefined && out.bestWhileHeldPct < 3 && (p.pnlPct ?? 0) < 0) {
      notes.push("nunca llegó a ir en positivo: el problema fue la entrada, no la salida");
    }
    if (out.highWhileHeldPct !== undefined && out.highWhileHeldPct >= 10) notes.push(`llegó a +${out.highWhileHeldPct} % (puede ser un pico no vendible)`);
    out.reading = notes.join("; ") || `medido segundo a segundo con las operaciones del pool (${inWindow.length} en la ventana)`;
    persistPathFeatures(p, out);
    return out;
  } catch {
    return null; // sin datos finos: se sigue por velas de 1 min
  }
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
  const shortTrade = close - open < MIN_MEASURABLE_SEC;
  // Operación de segundos: las velas de 1 min no la miden. Se intenta con las operaciones reales del pool
  // (segundo a segundo); si no hay datos suficientes, se sigue con velas y se marca como poco fiable.
  if (shortTrade && !perp) {
    const fine = await fineFromTrades(p, open, close);
    if (fine) {
      if (fine.ifHeld30Pct !== undefined) cache.set(p.id, fine);
      return fine;
    }
  }
  const raw = perp ? await perpCandles(perp[1]!, open - 120, end) : await candles(p.venue, p.asset, open - 120, end);
  // En un corto se invierten las velas (1/precio): así "subir" siempre es a favor y el resto no cambia.
  const cs = perp?.[2] === "corto" ? raw.map(([t, o, h, l, c]) => [t, 1 / o, 1 / l, 1 / h, 1 / c] as [number, number, number, number, number]) : raw;
  const entry = priceAt(cs, open) ?? cs[0]?.[4];
  const exit = priceAt(cs, close);
  if (!entry || !exit) return { ...base, unavailable: "sin velas en ese intervalo" };
  // Cierres de los minutos terminados mientras la tenía, y máximos de los minutos que tocó.
  const held = cs.filter((c) => c[0] + 60 > open && c[0] + 60 <= close);
  const touched = cs.filter((c) => c[0] + 60 > open && c[0] <= close);
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
    lowWhileHeldPct: touched.length ? pct(entry, Math.min(...touched.map((c) => c[3])), d) : undefined,
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
  } else if (!perp && out.lowWhileHeldPct !== undefined && base.actualPct !== null && base.actualPct < out.lowWhileHeldPct - (roundTrip(p) + 2)) {
    // Vendió por debajo de lo más bajo que marcan las velas (más el coste de entrar y salir): las velas no vieron el
    // precio real (otro pool, o una caída más rápida que el minuto).
    out.unreliable = `la venta real (${base.actualPct} %) quedó por debajo de lo más bajo de las velas (${out.lowWhileHeldPct} %): las velas no recogieron el precio real`;
    notes.unshift("lectura poco fiable, ver unreliable");
  } else if (!perp && out.highWhileHeldPct !== undefined && base.actualPct !== null && base.actualPct > out.highWhileHeldPct + 2) {
    // Vendió por encima de lo más alto que marcan las velas (en la M13, un TP de +6 % con velas que nunca pasaron de 0).
    out.unreliable = `la venta real (${base.actualPct} %) quedó por encima de lo más alto de las velas (${out.highWhileHeldPct} %): las velas no recogieron el precio real`;
    notes.unshift("lectura poco fiable, ver unreliable");
  } else {
    // Un stop que no saltó aunque las velas bajan bastante más allá de él: esa bajada no la vio el precio que vigila
    // las órdenes (en la M30, velas a -19 % con un stop a -12 % sin disparar y venta en -7 %).
    const stop = untriggeredStopPct(p, entry);
    if (!perp && stop !== undefined && out.lowWhileHeldPct !== undefined && out.lowWhileHeldPct < stop - 3) {
      out.unreliable = `las velas bajan a ${out.lowWhileHeldPct} % pero el stop en ${stop} % no saltó: no son el precio al que se vendía`;
      notes.unshift("lectura poco fiable, ver unreliable");
    }
  }
  out.reading = notes.join("; ") || "sin nada destacable";
  persistPathFeatures(p, out);
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
