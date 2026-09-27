// Panel web local para seguir al agente en directo. Lo arranca la herramienta `start_dashboard`
// del servidor MCP, o a mano con `npm run dashboard` (ver cli.ts).
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import { asset } from "../paths.js";
import { db } from "../db.js";
import { getActiveMission, getLastMission, labRunStatus, missionHistory, type Mission } from "../sim/mission.js";
import { listOrders } from "../sim/orders.js";
import { valuation } from "../sim/portfolio.js";
import { timeline } from "./timeline.js";

const INDEX_HTML = asset("index.html", "src/dashboard/index.html");

type Valuation = Awaited<ReturnType<typeof valuation>>;
let cached: { at: string; value: Valuation } | null = null;
let cachedLab: Awaited<ReturnType<typeof labRunStatus>> = null;
let lastSnapshot = 0;
let running: { url: string } | null = null;

// La valoración consulta precios reales, así que se refresca en segundo plano y no en cada petición.
async function refreshValuation(log: (msg: string) => void) {
  // Clasificación de la tanda del laboratorio (también consulta precios reales).
  cachedLab = await labRunStatus().catch((err) => {
    log(`Error valorando el laboratorio: ${(err as Error).message}`);
    return cachedLab;
  });
  try {
    const mission = getActiveMission() ?? getLastMission();
    if (!mission) {
      cached = null;
      return;
    }
    const record = mission.status === "active" && Date.now() - lastSnapshot >= 60_000;
    cached = { at: new Date().toISOString(), value: await valuation(mission.id, record) };
    if (record) lastSnapshot = Date.now();
  } catch (err) {
    log(`Error valorando la cartera: ${(err as Error).message}`);
  }
}

function state() {
  const mission: Mission | undefined = getActiveMission() ?? getLastMission();
  const snapshots = mission
    ? (db.prepare("SELECT ts, total_usd FROM snapshots WHERE mission_id = ? ORDER BY ts").all(mission.id) as Array<{ ts: string; total_usd: number }>)
    : [];
  return {
    now: new Date().toISOString(),
    mission: mission ?? null,
    // La valoración en caché puede ser de la misión anterior justo después de crear otra.
    valuation: cached && mission && cached.value.missionId === mission.id ? cached.value : null,
    valuedAt: cached?.at ?? null,
    orders: mission ? listOrders(mission.id, "open") : [],
    snapshots,
    history: missionHistory(),
    lab: cachedLab,
    lessons: db.prepare("SELECT id, created_at, mission_id, text, applies_to, confidence FROM lessons ORDER BY id DESC").all(),
  };
}

function send(res: http.ServerResponse, status: number, type: string, body: string) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

function handler(port: number) {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    try {
      if (url.pathname === "/") {
        // Se lee en cada petición para que los cambios en el HTML se vean al recargar.
        return send(res, 200, "text/html; charset=utf-8", readFileSync(INDEX_HTML, "utf8"));
      }
      if (url.pathname === "/api/state") return send(res, 200, "application/json", JSON.stringify(state()));
      if (url.pathname === "/api/events") {
        const mission = getActiveMission() ?? getLastMission();
        const since = url.searchParams.get("all") ? "1970" : (mission?.created_at ?? "1970");
        return send(res, 200, "application/json", JSON.stringify(timeline(since, mission?.id ?? null)));
      }
      send(res, 404, "text/plain", "No encontrado");
    } catch (err) {
      send(res, 500, "text/plain", (err as Error).message);
    }
  };
}

/** ¿Hay ya un panel de este proyecto respondiendo en ese puerto (p. ej. de otra sesión)? */
async function isOurDashboard(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/state`, { signal: AbortSignal.timeout(2000) });
    return res.ok && "mission" in ((await res.json()) as object);
  } catch {
    return false;
  }
}

/**
 * Arranca el panel en 127.0.0.1 (solo accesible desde este ordenador). Si ya está en marcha,
 * en este proceso o en otro, devuelve su URL sin arrancar otro.
 */
export async function startDashboard(opts: { port?: number; log?: (msg: string) => void } = {}): Promise<{ url: string; alreadyRunning: boolean }> {
  const port = opts.port ?? Number(process.env.DASHBOARD_PORT || 4321);
  const log = opts.log ?? console.error;
  const url = `http://localhost:${port}`;
  if (running) return { url: running.url, alreadyRunning: true };
  if (await isOurDashboard(url)) return { url, alreadyRunning: true };

  const server = http.createServer(handler(port));
  await new Promise<void>((resolve, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) =>
      reject(err.code === "EADDRINUSE" ? new Error(`El puerto ${port} está ocupado por otro programa. Usa otro con DASHBOARD_PORT.`) : err),
    );
    server.listen(port, "127.0.0.1", resolve);
  });
  running = { url };
  await refreshValuation(log);
  setInterval(() => refreshValuation(log), 15_000).unref();
  return { url, alreadyRunning: false };
}

/** Abre una URL en el navegador por defecto del sistema. */
export function openInBrowser(url: string) {
  const [cmd, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}
