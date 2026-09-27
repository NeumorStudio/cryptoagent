// Servidor MCP del simulador para usar el agente desde Claude Code (con la suscripción).
// Expone la cartera simulada, el diario y las notas. La navegación la hace Claude Code
// con su propio navegador. stdout es el canal del protocolo: no usar console.log.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkOrders } from "./sim/orders.js";
import { openInBrowser, startDashboard } from "./dashboard/server.js";
import { checkMission, createLabRun, createMission, getActiveMission, getLastMission, getMission, labRunStatus, stopMission } from "./sim/mission.js";
import { config } from "./config.js";
import { endSession, sessionBriefing, startSession } from "./sim/session.js";
import { statusReport } from "./sim/status.js";
import { SIM_TOOLS, runTool } from "./tools/index.js";

const server = new McpServer({ name: "cryptosim", version: "0.1.0" });

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

// Varios agentes pueden trabajar a la vez (laboratorio), cada uno sobre su misión: el agente del
// laboratorio indica su mission_id en cada llamada; si no lo indica, se usa la misión principal.
const missionIdParam = z
  .number()
  .int()
  .optional()
  .describe("Solo en el laboratorio: la misión sobre la que trabajas. Si no la indicas, se usa la misión principal.");

function resolveMission(requested: number | undefined): number | null {
  if (requested !== undefined) {
    if (!getMission(requested)) throw new Error(`No existe la misión #${requested}`);
    return requested;
  }
  return (getActiveMission() ?? getLastMission())?.id ?? null;
}

// Una sesión de trabajo abierta por misión.
const sessions = new Map<number | null, number>();
const sessionFor = (missionId: number | null) => {
  if (!sessions.has(missionId)) sessions.set(missionId, startSession(missionId));
  return sessions.get(missionId)!;
};

server.registerTool(
  "start_session",
  {
    description:
      "Empieza una sesión de trabajo. Llámala antes que cualquier otra herramienta: devuelve la hora, tu cartera, tus notas y el diario reciente.",
    inputSchema: { mission_id: missionIdParam },
  },
  async ({ mission_id }) => {
    try {
      await checkOrders().catch(() => []);
      await checkMission().catch(() => []);
      const missionId = resolveMission(mission_id);
      const sessionId = startSession(missionId);
      sessions.set(missionId, sessionId);
      return text(await sessionBriefing(sessionId, missionId));
    } catch (err) {
      return { ...text(`Error: ${(err as Error).message}`), isError: true };
    }
  },
);

server.registerTool(
  "end_session",
  {
    description: "Cierra la sesión con un resumen de lo que hiciste. Devuelve el estado final de la cartera.",
    inputSchema: { summary: z.string(), mission_id: missionIdParam },
  },
  async ({ summary, mission_id }) => {
    try {
      const missionId = resolveMission(mission_id);
      const sessionId = sessions.get(missionId);
      if (sessionId === undefined) return { ...text("No hay ninguna sesión abierta."), isError: true };
      const end = await endSession(sessionId, missionId, summary);
      sessions.delete(missionId);
      return text(JSON.stringify(end, null, 2));
    } catch (err) {
      return { ...text(`Error: ${(err as Error).message}`), isError: true };
    }
  },
);

// ─── Herramientas de configuración: las usa la sesión del usuario (comando /trading), ─────
// no el agente. El subagente `trader` las tiene prohibidas en .claude/agents/trader.md.

server.registerTool(
  "create_mission",
  {
    description:
      "[Solo para el usuario, no para el agente trader] Crea una misión nueva: reinicia la cartera simulada con el capital " +
      "indicado y fija el objetivo y el plazo en tiempo real. Si ya hay una misión activa, falla salvo que replace = true.",
    inputSchema: {
      capital_usd: z.number().positive(),
      target_usd: z.number().positive(),
      duration_minutes: z.number().positive(),
      replace: z.boolean().default(false).describe("Cancelar la misión activa si la hay"),
      instructions: z.string().optional().describe("Instrucciones del usuario para esta misión. Vacío = modo libre"),
    },
  },
  async ({ capital_usd, target_usd, duration_minutes, replace, instructions }) => {
    const active = getActiveMission();
    if (active && !replace) {
      return {
        ...text(`Ya hay una misión activa (#${active.id}, objetivo ${active.target_usd} USD, plazo ${active.deadline}). Pregunta al usuario si quiere reemplazarla.`),
        isError: true,
      };
    }
    try {
      const mission = await createMission(capital_usd, target_usd, duration_minutes, instructions);
      return text(JSON.stringify(mission, null, 2));
    } catch (err) {
      return { ...text(`Error: ${(err as Error).message}`), isError: true };
    }
  },
);

server.registerTool(
  "stop_mission",
  {
    description:
      "[Solo para el usuario, no para el agente trader] Detiene una misión antes de tiempo (por defecto, la principal) y cancela sus órdenes. " +
      "Con close_positions = true vende todas las posiciones a mercado; si no, la cartera queda como está.",
    inputSchema: { close_positions: z.boolean(), mission_id: z.number().int().optional() },
  },
  async ({ close_positions, mission_id }) => {
    try {
      const r = await stopMission(close_positions, mission_id);
      return text(
        `Misión #${r.missionId} detenida. Valor final: ${r.finalUsd.toFixed(2)} USD.` +
          (r.problems.length ? `\nNo se pudo vender: ${r.problems.join("; ")}` : ""),
      );
    } catch (err) {
      return { ...text(`Error: ${(err as Error).message}`), isError: true };
    }
  },
);

server.registerTool(
  "create_lab_run",
  {
    description:
      "[Solo para el usuario, no para los agentes] Crea una tanda del laboratorio: varias misiones idénticas a la vez, cada una con su " +
      "propia cartera, repartidas entre grupos (control: sin memoria; memoria: con el manual de estrategia; explorador: sin repetir lo " +
      "conocido). Devuelve el id de la tanda y el id de misión de cada agente.",
    inputSchema: {
      capital_usd: z.number().positive(),
      target_usd: z.number().positive(),
      duration_minutes: z.number().positive(),
      instructions: z.string().optional(),
      control: z.number().int().min(0).default(0),
      memoria: z.number().int().min(0).default(0),
      explorador: z.number().int().min(0).default(0),
    },
  },
  async ({ capital_usd, target_usd, duration_minutes, instructions, control, memoria, explorador }) => {
    try {
      const run = await createLabRun({
        capitalUsd: capital_usd,
        targetUsd: target_usd,
        durationMinutes: duration_minutes,
        instructions,
        groups: { control, memoria, explorador },
      });
      return text(JSON.stringify(run, null, 2));
    } catch (err) {
      return { ...text(`Error: ${(err as Error).message}`), isError: true };
    }
  },
);

server.registerTool(
  "lab_status",
  {
    description: "Clasificación de una tanda del laboratorio (por defecto, la última): valor y resultado de cada agente y su grupo.",
    inputSchema: { run_id: z.number().int().optional() },
  },
  async ({ run_id }) => {
    try {
      const status = await labRunStatus(run_id);
      return text(status ? JSON.stringify(status, null, 2) : "Todavía no hay ninguna tanda del laboratorio.");
    } catch (err) {
      return { ...text(`Error: ${(err as Error).message}`), isError: true };
    }
  },
);

server.registerTool(
  "status_report",
  {
    description:
      "Resumen en texto de la misión actual (o la última): progreso, valor, tiempo restante, posiciones con su resultado, órdenes, " +
      "operaciones cerradas, últimos movimientos con su motivo y la última nota del agente. Pensado para enseñárselo al usuario en el chat.",
    inputSchema: {},
  },
  async () => {
    try {
      return text(await statusReport());
    } catch (err) {
      return { ...text(`Error: ${(err as Error).message}`), isError: true };
    }
  },
);

server.registerTool(
  "start_dashboard",
  {
    description:
      "[Solo para el usuario, no para el agente trader] Arranca en local (127.0.0.1) el panel web que muestra la misión y lo que hace " +
      "el agente en directo, y devuelve su URL. Con open_in_system_browser = true, además lo abre en el navegador por defecto.",
    inputSchema: { open_in_system_browser: z.boolean().default(false) },
  },
  async ({ open_in_system_browser }) => {
    try {
      const { url, alreadyRunning } = await startDashboard({ log: (m) => console.error(m) });
      if (open_in_system_browser) openInBrowser(url);
      return text(`${alreadyRunning ? "El panel ya estaba en marcha" : "Panel arrancado"} en ${url}${open_in_system_browser ? " (abierto en el navegador)" : ""}`);
    } catch (err) {
      return { ...text(`Error: ${(err as Error).message}`), isError: true };
    }
  },
);

for (const tool of SIM_TOOLS) {
  // Las herramientas que ya tienen su propio mission_id (p. ej. journal_history) lo usan para otra cosa:
  // el de la misión de trabajo se llama igual, así que solo se añade donde no existe.
  const shape = {
    ...(tool.schema.shape as Record<string, z.ZodType>),
    ...("mission_id" in tool.schema.shape ? {} : { mission_id: missionIdParam }),
  } as z.ZodRawShape;
  server.registerTool(tool.name, { description: tool.description, inputSchema: shape }, async (raw: Record<string, unknown>) => {
    try {
      const ownsParam = "mission_id" in tool.schema.shape;
      const { mission_id, ...rest } = raw as { mission_id?: number };
      const missionId = resolveMission(mission_id);
      const input = ownsParam ? raw : rest;
      const { content, isError } = await runTool(tool.name, input, { sessionId: sessionFor(missionId), missionId });
      return { ...text(typeof content === "string" ? content : JSON.stringify(content)), isError };
    } catch (err) {
      return { ...text(`Error: ${(err as Error).message}`), isError: true };
    }
  });
}

await server.connect(new StdioServerTransport());

// Mientras Claude Code está abierto, este proceso también vigila las órdenes condicionales
// y la misión (el reclamo atómico evita ejecutar dos veces si además corre `npm run watcher`).
setInterval(async () => {
  await checkOrders().catch((err) => console.error(`Error revisando órdenes: ${(err as Error).message}`));
  await checkMission().catch((err) => console.error(`Error revisando la misión: ${(err as Error).message}`));
}, config.watchIntervalSeconds * 1000);
