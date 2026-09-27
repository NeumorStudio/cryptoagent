// Acceso HTTP compartido a las APIs de mercado. Con varios agentes a la vez (laboratorio) evita
// saturarlas: caché de pocos segundos, peticiones idénticas simultáneas agrupadas en una sola,
// un máximo de peticiones en paralelo por servicio y reintentos si el servicio pide esperar.

/** Validez por defecto de una respuesta en caché. Corta: los precios tienen que ser del momento. */
export const DEFAULT_TTL_MS = 5_000;
const MAX_PARALLEL_PER_HOST = 6;
const MAX_RETRIES = 3;
const MAX_CACHE_ENTRIES = 2_000;

interface Cached {
  expires: number;
  value: Promise<{ status: number; body: string }>;
}
const cache = new Map<string, Cached>();

// Limitador de concurrencia por servicio (host).
const active = new Map<string, number>();
const waiting = new Map<string, Array<() => void>>();

async function acquire(host: string) {
  if ((active.get(host) ?? 0) >= MAX_PARALLEL_PER_HOST) {
    await new Promise<void>((resolve) => {
      const queue = waiting.get(host) ?? [];
      queue.push(resolve);
      waiting.set(host, queue);
    });
  }
  active.set(host, (active.get(host) ?? 0) + 1);
}

function release(host: string) {
  active.set(host, (active.get(host) ?? 1) - 1);
  waiting.get(host)?.shift()?.();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request(url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    await acquire(host);
    let res: Response;
    let body: string;
    try {
      res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
      });
      body = await res.text();
    } finally {
      release(host);
    }
    // Demasiadas peticiones o servicio saturado: esperar y reintentar.
    if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 500 * 2 ** attempt);
      continue;
    }
    return { status: res.status, body };
  }
}

/**
 * GET con caché compartida. Devuelve el código HTTP y el cuerpo en texto.
 * Solo se guardan en caché las respuestas correctas; los errores se reintentan en la siguiente llamada.
 */
export function fetchText(url: string, opts: { timeoutMs?: number; ttlMs?: number } = {}): Promise<{ status: number; body: string }> {
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const nowMs = Date.now();
  const hit = cache.get(url);
  if (hit && hit.expires > nowMs) return hit.value;

  const value = request(url, opts.timeoutMs ?? 15_000);
  cache.set(url, { expires: nowMs + ttl, value });
  value.then(
    (r) => {
      if (r.status < 200 || r.status >= 300) cache.delete(url);
    },
    () => cache.delete(url),
  );
  if (cache.size > MAX_CACHE_ENTRIES) {
    for (const [k, v] of cache) if (v.expires <= nowMs) cache.delete(k);
  }
  return value;
}

export async function fetchJson<T = unknown>(url: string, timeoutMs = 15_000, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const { status, body } = await fetchText(url, { timeoutMs, ttlMs });
  if (status < 200 || status >= 300) throw new Error(`HTTP ${status} en ${url}: ${body.slice(0, 300)}`);
  return JSON.parse(body) as T;
}
