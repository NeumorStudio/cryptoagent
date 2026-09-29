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

/** Para los tests. */
export function resetMarketState() {
  byChain.clear();
}
