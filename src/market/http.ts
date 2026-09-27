// Acceso HTTP compartido a las APIs de mercado. Evita saturarlas (el agente, el panel y el
// vigilante consultan los mismos precios): caché de pocos segundos, peticiones idénticas simultáneas agrupadas en una sola,
// un máximo de peticiones en paralelo por servicio y reintentos si el servicio pide esperar.
// Los servicios con límite por minuto (Jupiter) además se reparten turnos entre todos los procesos
// que usan la base de datos: cada sesión de Claude Code tiene su propio servidor MCP y todos salen
// por la misma IP.
import { db } from "../db.js";

/** Validez por defecto de una respuesta en caché. Corta: los precios tienen que ser del momento. */
export const DEFAULT_TTL_MS = 5_000;
const MAX_PARALLEL_PER_HOST = 6;
const MAX_RETRIES = 5;

/** Separación mínima entre peticiones a cada servicio, contando todos los procesos. */
const MIN_INTERVAL_MS: Record<string, number> = {
  "lite-api.jup.ag": 1_100,
  // KyberSwap admite unas 30 peticiones cada 10 s.
  "aggregator-api.kyberswap.com": 350,
  // GoPlus no publica su límite: se va despacio (sus respuestas se guardan en caché más tiempo).
  "api.gopluslabs.io": 2_000,
};
/** Pausa común para todos cuando el servicio responde 429. */
const COOLDOWN_MS = 6_000;

db.exec("CREATE TABLE IF NOT EXISTS http_pacing (host TEXT PRIMARY KEY, next_at INTEGER NOT NULL)");
const reserveStmt = db.prepare(
  `INSERT INTO http_pacing (host, next_at) VALUES (?, ?) ON CONFLICT(host) DO UPDATE SET next_at = max(next_at, ?) + ?
   RETURNING next_at`,
);
const cooldownStmt = db.prepare(
  "INSERT INTO http_pacing (host, next_at) VALUES (?, ?) ON CONFLICT(host) DO UPDATE SET next_at = max(next_at, excluded.next_at)",
);

/** Reserva el siguiente turno del servicio y espera a que llegue. */
async function pace(host: string) {
  const interval = MIN_INTERVAL_MS[host];
  if (!interval) return;
  const nowMs = Date.now();
  const { next_at } = reserveStmt.get(host, nowMs + interval, nowMs, interval) as { next_at: number };
  const slot = next_at - interval;
  if (slot > nowMs) await sleep(slot - nowMs);
}
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

// Los tests sustituyen fetch por respuestas fijas.
let fetchImpl: typeof fetch = (...args) => fetch(...args);
export function setFetchImpl(impl: typeof fetch) {
  fetchImpl = impl;
  cache.clear();
}

export interface RequestOpts {
  timeoutMs?: number;
  /** Validez en caché de una respuesta correcta. */
  ttlMs?: number;
  method?: "GET" | "POST";
  /** Cuerpo de un POST: se envía como JSON. */
  body?: unknown;
  headers?: Record<string, string>;
}

async function request(url: string, opts: RequestOpts & { timeoutMs: number }): Promise<{ status: number; body: string }> {
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    await pace(host);
    await acquire(host);
    let res: Response;
    let body: string;
    try {
      res = await fetchImpl(url, {
        method: opts.method ?? "GET",
        signal: AbortSignal.timeout(opts.timeoutMs),
        headers: {
          accept: "application/json",
          "user-agent": "Mozilla/5.0",
          ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
          ...opts.headers,
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
      body = await res.text();
    } finally {
      release(host);
    }
    // Demasiadas peticiones o servicio saturado: esperar y reintentar.
    if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 15) * 1000 : COOLDOWN_MS;
      // Los servicios con turnos pausan a todos los procesos; el resto solo reintenta esta petición.
      if (MIN_INTERVAL_MS[host]) cooldownStmt.run(host, Date.now() + wait);
      else await sleep(wait);
      continue;
    }
    return { status: res.status, body };
  }
}

/**
 * Petición HTTP con caché compartida (GET o POST; en un POST la caché distingue por cuerpo).
 * Devuelve el código HTTP y el cuerpo en texto. Solo se guardan en caché las respuestas correctas;
 * los errores se reintentan en la siguiente llamada.
 */
export function fetchText(url: string, opts: RequestOpts = {}): Promise<{ status: number; body: string }> {
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const key = opts.body !== undefined || opts.method === "POST" ? `${opts.method ?? "GET"} ${url} ${JSON.stringify(opts.body ?? null)}` : url;
  const nowMs = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > nowMs) return hit.value;

  const value = request(url, { ...opts, timeoutMs: opts.timeoutMs ?? 15_000 });
  cache.set(key, { expires: nowMs + ttl, value });
  value.then(
    (r) => {
      if (r.status < 200 || r.status >= 300) cache.delete(key);
    },
    () => cache.delete(key),
  );
  if (cache.size > MAX_CACHE_ENTRIES) {
    for (const [k, v] of cache) if (v.expires <= nowMs) cache.delete(k);
  }
  return value;
}

export async function fetchJson<T = unknown>(url: string, timeoutMs?: number, ttlMs?: number): Promise<T>;
export async function fetchJson<T = unknown>(url: string, opts: RequestOpts): Promise<T>;
export async function fetchJson<T = unknown>(url: string, a: number | RequestOpts = {}, ttlMs?: number): Promise<T> {
  const opts: RequestOpts = typeof a === "number" ? { timeoutMs: a, ttlMs } : a;
  const { status, body } = await fetchText(url, opts);
  if (status < 200 || status >= 300) throw new Error(`HTTP ${status} en ${url}: ${body.slice(0, 300)}`);
  return JSON.parse(body) as T;
}

// ─── Cupos por ventana de tiempo ────────────────────────────────────────────
// Algunos servicios gratuitos limitan las peticiones por IP en ventanas largas (p. ej. Li.Fi: 75 cada 2 h).
// El cupo se comparte entre todos los procesos a través de la base de datos.
const budgetStmt = db.prepare(
  `INSERT INTO http_budget (host, window_start, used) VALUES (?, ?, 1)
   ON CONFLICT(host) DO UPDATE SET
     window_start = CASE WHEN window_start + ? <= ? THEN excluded.window_start ELSE window_start END,
     used = CASE WHEN window_start + ? <= ? THEN 1 ELSE used + 1 END
   RETURNING used`,
);

/** Reserva una petición del cupo de un servicio. Devuelve false si el cupo de la ventana actual está agotado. */
export function takeBudget(host: string, limit: number, windowMs: number): boolean {
  const nowMs = Date.now();
  const { used } = budgetStmt.get(host, nowMs, windowMs, nowMs, windowMs, nowMs) as { used: number };
  return used <= limit;
}
