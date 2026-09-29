// Cómo estaba el mercado cuando el agente decidió: lo mide el último escaneo de la cadena (tokens jóvenes que
// había y cuánta gente operaba). Se guarda con cada compra para que el revisor pueda aprender cuándo funciona
// cada enfoque (de madrugada o por la mañana, con el mercado movido o parado), no solo con qué token.

interface ScanState {
  at: number;
  young: number;
  medianTraders5m?: number;
}

const byChain = new Map<string, ScanState>();
/** Un escaneo más viejo que esto ya no describe el mercado del momento. */
const MAX_AGE_MS = 20 * 60_000;

/** Anota lo que ha visto un escaneo: tokens de menos de 3 h y la mediana de operadores en 5 min. */
export function recordScan(chain: string, candidates: Array<Record<string, unknown>>) {
  const ages = candidates.map((c) => Number(c.ageMinutes)).filter((x) => Number.isFinite(x));
  const traders = candidates.map((c) => Number(c.traders5m)).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  byChain.set(chain, {
    at: Date.now(),
    young: ages.filter((a) => a < 180).length,
    ...(traders.length ? { medianTraders5m: traders[Math.floor(traders.length / 2)] } : {}),
  });
}

/** Contexto de mercado de una compra: hora UTC y, si hay un escaneo reciente de esa cadena, su actividad. */
export function marketContext(chain: string) {
  const s = byChain.get(chain);
  const fresh = s && Date.now() - s.at <= MAX_AGE_MS;
  return {
    hourUtc: new Date().getUTCHours(),
    ...(fresh ? { marketYoungTokens: s!.young, ...(s!.medianTraders5m !== undefined ? { marketMedianTraders5m: s!.medianTraders5m } : {}) } : {}),
  };
}

// ─── Lecturas de un token antes de comprarlo ───────────────────────────────
// La primera y la última lectura (token_report o el chequeo del escaneo) de cada token: con ellas se guarda en
// la compra cómo evolucionaban la liquidez y los compradores netos mientras el agente lo miraba.

interface Read {
  at: number;
  liquidityUsd?: number;
  netBuyers5m?: number;
}
const reads = new Map<string, { first: Read; last: Read; count: number }>();
const READS_MAX_AGE_MS = 30 * 60_000;
const readKey = (chain: string, token: string) => `${chain}:${token.toLowerCase()}`;

/** Anota una lectura de un token (liquidez y compradores netos del momento). */
export function recordRead(chain: string, token: string, r: { liquidityUsd?: number; netBuyers5m?: number }) {
  const key = readKey(chain, token);
  const now: Read = { at: Date.now(), ...r };
  const prev = reads.get(key);
  reads.set(key, prev && now.at - prev.first.at <= READS_MAX_AGE_MS ? { first: prev.first, last: now, count: prev.count + 1 } : { first: now, last: now, count: 1 });
}

/** Cómo cambió el token entre la primera y la última lectura antes de comprar. */
export function readTrend(chain: string, token: string): { readsBeforeBuy: number; minutesBetweenReads?: number; liquidityTrendPct?: number; netBuyersTrend?: number } {
  const r = reads.get(readKey(chain, token));
  if (!r || Date.now() - r.last.at > READS_MAX_AGE_MS) return { readsBeforeBuy: 0 };
  const trend: ReturnType<typeof readTrend> = { readsBeforeBuy: r.count };
  if (r.count >= 2) {
    trend.minutesBetweenReads = Number(((r.last.at - r.first.at) / 60_000).toFixed(1));
    if (r.first.liquidityUsd && r.last.liquidityUsd !== undefined) trend.liquidityTrendPct = Math.round((r.last.liquidityUsd / r.first.liquidityUsd - 1) * 100);
    if (r.first.netBuyers5m !== undefined && r.last.netBuyers5m !== undefined) trend.netBuyersTrend = r.last.netBuyers5m - r.first.netBuyers5m;
  }
  return trend;
}

// ─── Datos del token tal como los vio el agente al decidir ─────────────────
// Los datos de entrada de una posición se leían otra vez después de comprar; en un token de minutos cambian en
// segundos (en la M30, Pumpcat: +186 % en 5 min al decidir y -31 % guardado). Se guarda la última lectura
// completa y, si es reciente, esa es la que queda en la posición: la que usó para decidir.
const decided = new Map<string, { at: number; features: Record<string, unknown> }>();
const DECIDED_MAX_AGE_MS = 5 * 60_000;

export function recordFeatures(chain: string, token: string, features: Record<string, unknown>) {
  decided.set(readKey(chain, token), { at: Date.now(), features });
}

/** La última lectura completa del token si tiene menos de 5 minutos, con su antigüedad en segundos. */
export function decidedFeatures(chain: string, token: string) {
  const d = decided.get(readKey(chain, token));
  if (!d || Date.now() - d.at > DECIDED_MAX_AGE_MS) return undefined;
  return { features: d.features, ageSeconds: Math.round((Date.now() - d.at) / 1000) };
}

/** Para los tests. */
export function resetMarketState() {
  byChain.clear();
  reads.clear();
  decided.clear();
}
