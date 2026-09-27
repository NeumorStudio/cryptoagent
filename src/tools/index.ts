import { readFileSync } from "node:fs";
import { z } from "zod";
import { db, logActivity, logJournal, now } from "../db.js";
import * as mission from "../sim/mission.js";
import * as orders from "../sim/orders.js";
import * as sim from "../sim/portfolio.js";
import { asset } from "../paths.js";
import { json, tool, type ToolOutput } from "./define.js";


// Límite prudente para que una llamada MCP no se alargue demasiado.
const MAX_WAIT_MINUTES = 10;

const FIELD_GUIDE = asset("guia-del-terreno.md", "knowledge/guia-del-terreno.md");

const isTradingTool = (name: string) => name.startsWith("simulate_") || name.endsWith("_trigger_order");

const reasoning = z.string().describe("Por qué haces esto. Queda en el diario.");

// Tesis obligatoria en cada operación de trading: obliga a argumentar con pruebas y fuentes.
const thesis = z
  .object({
    why: z.string().min(1).describe("Por qué esta operación y por qué ahora"),
    evidence: z.string().min(1).describe("Qué has comprobado que la respalda: datos concretos, no solo que el precio se mueve"),
    sources: z.array(z.string().min(1)).min(1).describe("Fuentes consultadas: URLs o APIs concretas"),
    exit_plan: z
      .string()
      .min(1)
      .describe("Cuándo cerrarías con beneficio y cuándo la darías por fallida (si es una venta: qué harás después)"),
  })
  .describe("Tesis de la operación. Queda en el diario y el usuario la ve en el panel.");

const formatThesis = (t: z.infer<typeof thesis>) =>
  `Por qué: ${t.why}\nPruebas: ${t.evidence}\nFuentes: ${t.sources.join(" · ")}\nPlan: ${t.exit_plan}`;

// Herramientas del simulador: las comparten el runner por API y el servidor MCP.
export const SIM_TOOLS = [
  tool({
    name: "field_guide",
    description:
      "Guía del terreno: qué mercados puede ejecutar el simulador y cómo los simula, cómo funciona pump.fun " +
      "(curva, comisiones, graduación) y qué APIs públicas de datos responden, con sus URLs y campos. Hechos, no recomendaciones.",
    schema: z.object({}),
    run: async () => readFileSync(FIELD_GUIDE, "utf8"),
  }),
  tool({
    name: "log_progress",
    description:
      "Registro de trabajo: anota qué vas a investigar o hacer a continuación, qué has encontrado y qué decisiones tomas. " +
      "Se muestra en el panel del usuario.",
    schema: z.object({ entry: z.string() }),
    run: async ({ entry }, ctx) => {
      logActivity({ sessionId: ctx.sessionId, kind: "thought", title: entry });
      return "Anotado.";
    },
  }),
  tool({
    name: "mission_status",
    description:
      "Estado de tu misión: capital inicial, objetivo, valor actual de la cartera, cuánto falta y tiempo restante. " +
      "La misión termina sola al alcanzar el objetivo o al acabarse el plazo; entonces se cierran todas las posiciones a mercado.",
    schema: z.object({}),
    run: async () => json(await mission.missionStatus()),
  }),
  tool({
    name: "wait",
    description:
      `Deja pasar tiempo real (1-${MAX_WAIT_MINUTES} minutos). Mientras esperas, tus órdenes condicionales se siguen vigilando. ` +
      "Vuelve antes si la misión termina.",
    schema: z.object({ minutes: z.number().min(1).max(MAX_WAIT_MINUTES) }),
    run: async ({ minutes }) => {
      const until = Date.now() + minutes * 60_000;
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, Math.min(20_000, until - Date.now())));
        await orders.checkOrders().catch(() => []);
        const ended = await mission.checkMission().catch(() => []);
        if (ended.length || !mission.getActiveMission()) {
          return `La misión ha terminado mientras esperabas. Hora: ${now()}
${json(await mission.missionStatus())}`;
        }
      }
      return `Han pasado ${minutes} minutos. Hora actual: ${now()}
${json(await mission.missionStatus())}`;
    },
  }),
  tool({
    name: "http_get",
    description: "Hace una petición HTTP GET y devuelve la respuesta en texto (útil para APIs públicas en JSON).",
    schema: z.object({ url: z.string() }),
    run: async ({ url }) => {
      if (!/^https?:\/\//i.test(url)) throw new Error("Solo se permiten URLs http(s)");
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const body = await res.text();
      return `HTTP ${res.status}\n${body.slice(0, 20000)}${body.length > 20000 ? `\n… (truncado, ${body.length} caracteres en total)` : ""}`;
    },
  }),

  // ─── Cartera simulada ─────────────────────────────────────────────────────
  tool({
    name: "portfolio",
    description:
      "Muestra tu cartera simulada y su valor en USD a precio de liquidación real ahora mismo, " +
      "el PnL desde el inicio y lo que valdría el capital inicial si se hubiera mantenido en SOL.",
    schema: z.object({}),
    run: async () => json(await sim.valuation()),
  }),
  tool({
    name: "quote_solana_swap",
    description:
      "Cotiza un swap en Solana con Jupiter (agregador de DEX de mainnet) sin ejecutarlo. " +
      "input/output: dirección mint del token, o los alias SOL y USDC. amount en unidades del token de entrada.",
    schema: z.object({
      input: z.string(),
      output: z.string(),
      amount: z.number().positive(),
      slippage_bps: z.number().int().min(1).max(5000).default(50),
    }),
    run: async (i) => json(await sim.quoteSolana(i.input, i.output, i.amount, i.slippage_bps)),
  }),
  tool({
    name: "simulate_solana_swap",
    description:
      "Ejecuta en simulación un swap en tu monedero de Solana. El resultado es la cotización real de Jupiter en ese instante " +
      "(liquidez y comisiones de los pools incluidas). Se descuentan la fee de red en SOL y, si recibes un token nuevo, " +
      "la renta de la cuenta del token (se recupera al vaciarla). Necesitas SOL en el monedero para pagar la red.",
    schema: z.object({
      input: z.string(),
      output: z.string(),
      amount: z.number().positive(),
      slippage_bps: z.number().int().min(1).max(5000).default(50),
      thesis,
    }),
    run: async (i, ctx) =>
      json(
        await sim.swapSolana({
          sessionId: ctx.sessionId,
          input: i.input,
          output: i.output,
          amount: i.amount,
          slippageBps: i.slippage_bps,
          reasoning: formatThesis(i.thesis),
        }),
      ),
  }),
  tool({
    name: "simulate_binance_market_order",
    description:
      "Ejecuta en simulación una orden de mercado en Binance spot contra el order book real (precio medio y slippage reales, " +
      "comisión taker incluida). BUY: amount = cantidad del activo quote a gastar. SELL: amount = cantidad del activo base a vender. " +
      "symbol: par de Binance, p. ej. BTCUSDC.",
    schema: z.object({ symbol: z.string(), side: z.enum(["BUY", "SELL"]), amount: z.number().positive(), thesis }),
    run: async (i, ctx) =>
      json(await sim.binanceMarketOrder({ sessionId: ctx.sessionId, symbol: i.symbol, side: i.side, amount: i.amount, reasoning: formatThesis(i.thesis) })),
  }),
  tool({
    name: "simulate_transfer",
    description:
      "Mueve USDC o SOL entre tu monedero de Solana y tu cuenta de Binance, en simulación. " +
      "De Solana a Binance se paga la fee de red; de Binance a Solana, la comisión de retirada de Binance.",
    schema: z.object({ asset: z.enum(["USDC", "SOL"]), from: z.enum(["solana", "binance"]), amount: z.number().positive(), reasoning }),
    run: async (i, ctx) => json(await sim.transfer({ sessionId: ctx.sessionId, ...i })),
  }),
  tool({
    name: "place_solana_trigger_order",
    description:
      "Deja una orden condicional en Solana: cuando el precio en USD de trigger_asset cruce trigger_price (above = sube hasta o por encima, " +
      "below = baja hasta o por debajo), se ejecuta el swap indicado a mercado con la cotización real de ese instante. " +
      "Funciona aunque no estés en sesión. El precio se comprueba aproximadamente cada minuto, así que un pico muy breve puede no dispararla. " +
      "El saldo no se bloquea: si al dispararse no hay saldo suficiente, la orden falla.",
    schema: z.object({
      trigger_asset: z.string().describe("Mint del token cuyo precio se vigila, o alias SOL/USDC"),
      condition: z.enum(["above", "below"]),
      trigger_price: z.number().positive().describe("Precio en USD"),
      input: z.string(),
      output: z.string(),
      amount: z.number().positive().describe("Cantidad del token de entrada"),
      slippage_bps: z.number().int().min(1).max(5000).default(100),
      expires_hours: z.number().positive().optional(),
      thesis,
    }),
    run: async (i, ctx) =>
      json(
        await orders.placeOrder({
          sessionId: ctx.sessionId,
          venue: "solana",
          triggerAsset: i.trigger_asset,
          condition: i.condition,
          triggerPrice: i.trigger_price,
          action: { input: i.input, output: i.output, amount: i.amount, slippageBps: i.slippage_bps },
          expiresHours: i.expires_hours,
          reasoning: formatThesis(i.thesis),
        }),
      ),
  }),
  tool({
    name: "place_binance_trigger_order",
    description:
      "Deja una orden condicional en Binance: cuando el último precio de trigger_symbol cruce trigger_price, se ejecuta la orden de mercado " +
      "indicada contra el order book real de ese instante. Funciona aunque no estés en sesión; se comprueba aproximadamente cada minuto. " +
      "El saldo no se bloquea: si al dispararse no hay saldo suficiente, la orden falla.",
    schema: z.object({
      trigger_symbol: z.string().describe("Par de Binance cuyo precio se vigila, p. ej. SOLUSDC"),
      condition: z.enum(["above", "below"]),
      trigger_price: z.number().positive().describe("Precio en el activo quote del par"),
      symbol: z.string().describe("Par en el que se ejecuta la orden"),
      side: z.enum(["BUY", "SELL"]),
      amount: z.number().positive().describe("BUY: cantidad de quote a gastar. SELL: cantidad base a vender"),
      expires_hours: z.number().positive().optional(),
      thesis,
    }),
    run: async (i, ctx) =>
      json(
        await orders.placeOrder({
          sessionId: ctx.sessionId,
          venue: "binance",
          triggerAsset: i.trigger_symbol,
          condition: i.condition,
          triggerPrice: i.trigger_price,
          action: { symbol: i.symbol, side: i.side, amount: i.amount },
          expiresHours: i.expires_hours,
          reasoning: formatThesis(i.thesis),
        }),
      ),
  }),
  tool({
    name: "list_orders",
    description: "Lista tus órdenes condicionales: abiertas, cerradas (ejecutadas, fallidas, canceladas, caducadas) o todas.",
    schema: z.object({ status: z.enum(["open", "closed", "all"]).default("open") }),
    run: async ({ status }) => json(orders.listOrders(status)),
  }),
  tool({
    name: "cancel_order",
    description: "Cancela una orden condicional abierta.",
    schema: z.object({ id: z.number().int() }),
    run: async ({ id }, ctx) => orders.cancelOrder(id, ctx.sessionId),
  }),
  tool({
    name: "record_hypothetical_action",
    description:
      "Anota en el diario cualquier acción que harías pero que este simulador no puede ejecutar ni valorar " +
      "(de cualquier tipo). No cambia tu cartera. Describe con precisión qué harías, con qué parámetros y qué esperas que pase.",
    schema: z.object({
      action_type: z.string().describe("Nombre corto del tipo de acción, elegido por ti"),
      description: z.string(),
      details: z.string().describe("Parámetros concretos: nombres, cantidades, textos, URLs…"),
      expected_outcome: z.string(),
      reasoning,
    }),
    run: async (i, ctx) => {
      logJournal({
        sessionId: ctx.sessionId,
        kind: "hypothetical",
        summary: `[${i.action_type}] ${i.description}`,
        reasoning: i.reasoning,
        details: { details: i.details, expected_outcome: i.expected_outcome },
      });
      return "Anotado en el diario como acción hipotética (no afecta a la cartera).";
    },
  }),
  tool({
    name: "journal_history",
    description:
      "Devuelve las últimas entradas de tu diario de operaciones. Por defecto, de la misión actual; " +
      "con mission_id, las de una misión anterior (útil para analizarla y sacar lecciones).",
    schema: z.object({ limit: z.number().int().min(1).max(200).default(30), mission_id: z.number().int().optional() }),
    run: async ({ limit, mission_id }) => {
      const missions = db.prepare("SELECT id, created_at, ended_at FROM missions ORDER BY id").all() as Array<{ id: number; created_at: string; ended_at: string | null }>;
      const target = mission_id === undefined ? missions.at(-1) : missions.find((m) => m.id === mission_id);
      if (!target) throw new Error(mission_id === undefined ? "No hay misiones" : `No existe la misión #${mission_id}`);
      const next = missions.find((m) => m.id > target.id);
      const until = next?.created_at ?? "9999";
      return json(
        db.prepare("SELECT ts, kind, summary, reasoning, details FROM journal WHERE ts >= ? AND ts < ? ORDER BY id DESC LIMIT ?").all(target.created_at, until, limit),
      );
    },
  }),

  // ─── Memoria a largo plazo: lecciones entre misiones ──────────────────────
  tool({
    name: "recall_lessons",
    description:
      "Tu memoria entre misiones: el historial objetivo de misiones terminadas (parámetros y resultado, calculados por el simulador) " +
      "y las lecciones que has escrito, cada una vinculada a la misión de la que salió.",
    schema: z.object({}),
    run: async () =>
      json({
        missionHistory: mission.missionHistory(),
        lessons: db.prepare("SELECT id, created_at, mission_id, text FROM lessons ORDER BY id").all(),
      }),
  }),
  tool({
    name: "write_lesson",
    description:
      "Guarda una lección en tu memoria a largo plazo: qué hiciste, qué resultado dio y qué harías distinto. Se conserva entre misiones. " +
      "Por defecto se vincula a la misión actual (o a la última si no hay ninguna activa); indica mission_id para otra.",
    schema: z.object({ lesson: z.string(), mission_id: z.number().int().optional() }),
    run: async ({ lesson, mission_id }) => {
      const missionId = mission_id ?? mission.getActiveMission()?.id ?? mission.getLastMission()?.id ?? null;
      const id = db.prepare("INSERT INTO lessons (created_at, mission_id, text) VALUES (?, ?, ?)").run(now(), missionId, lesson).lastInsertRowid;
      return `Lección #${id} guardada${missionId ? ` (misión #${missionId})` : ""}.`;
    },
  }),
  tool({
    name: "delete_lesson",
    description: "Borra una lección de tu memoria cuando los resultados la contradigan o ya no te sirva.",
    schema: z.object({ id: z.number().int() }),
    run: async ({ id }) => {
      if (!db.prepare("DELETE FROM lessons WHERE id = ?").run(id).changes) throw new Error(`No existe la lección #${id}`);
      return `Lección #${id} borrada.`;
    },
  }),

  // ─── Memoria entre sesiones y tiempo ──────────────────────────────────────
  tool({
    name: "write_note",
    description: "Guarda una nota para ti mismo. Las notas se te muestran al empezar cada sesión futura.",
    schema: z.object({ text: z.string() }),
    run: async ({ text }, ctx) => {
      db.prepare("INSERT INTO notes (ts, session_id, text) VALUES (?, ?, ?)").run(now(), ctx.sessionId, text);
      return "Nota guardada.";
    },
  }),
  tool({
    name: "delete_note",
    description: "Borra una nota por su id cuando ya no sea útil.",
    schema: z.object({ id: z.number().int() }),
    run: async ({ id }) => {
      db.prepare("DELETE FROM notes WHERE id = ?").run(id);
      return "Nota borrada.";
    },
  }),
];

type AnyTool = (typeof SIM_TOOLS)[number];

export async function runTool(
  name: string,
  rawInput: unknown,
  ctx: { sessionId: number },
  tools: readonly AnyTool[] | readonly { name: string }[] = SIM_TOOLS,
): Promise<{ content: ToolOutput; isError: boolean }> {
  const def = (tools as readonly AnyTool[]).find((t) => t.name === name);
  if (!def) return { content: `Herramienta desconocida: ${name}`, isError: true };
  const parsed = def.schema.safeParse(rawInput);
  if (!parsed.success) return { content: `Entrada no válida: ${parsed.error.message}`, isError: true };
  if (isTradingTool(name) && !mission.getActiveMission()) {
    return { content: `Error: no hay ninguna misión activa. ${(await mission.missionStatus()).message ?? ""}`, isError: true };
  }
  try {
    const content = await (def.run as (i: unknown, c: typeof ctx) => Promise<ToolOutput>)(parsed.data, ctx);
    if (isTradingTool(name)) {
      // Tras cada operación se comprueba si ya se ha alcanzado el objetivo.
      const ended = await mission.checkMission().catch(() => []);
      if (ended.length && typeof content === "string") return { content: `${content}\n\n${ended.join("\n")}`, isError: false };
    }
    return { content, isError: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isTradingTool(name)) {
      logJournal({ sessionId: ctx.sessionId, kind: "rejected", summary: `${name} rechazada: ${message}`, details: rawInput });
    }
    return { content: `Error: ${message}`, isError: true };
  }
}

