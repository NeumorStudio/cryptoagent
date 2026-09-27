import { readFileSync } from "node:fs";
import { z } from "zod";
import { db, logActivity, logJournal, now } from "../db.js";
import { fetchText } from "../market/http.js";
import * as research from "../market/research.js";
import * as mission from "../sim/mission.js";
import * as memory from "../sim/memory.js";
import * as orders from "../sim/orders.js";
import * as positions from "../sim/positions.js";
import * as sim from "../sim/portfolio.js";
import { asset } from "../paths.js";
import { json, tool, type ToolCtx, type ToolOutput } from "./define.js";

/** Misión del contexto; las herramientas que la necesitan solo se ejecutan si existe. */
const mid = (ctx: ToolCtx): number => {
  if (ctx.missionId === null) throw new Error("No hay ninguna misión");
  return ctx.missionId;
};


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
    lessons_applied: z
      .string()
      .min(1)
      .describe("Qué lecciones de tu memoria aplicas aquí (por su id) y cómo, o por qué ninguna aplica a esta situación"),
  })
  .describe("Tesis de la operación. Queda en el diario y el usuario la ve en el panel.");

const formatThesis = (t: z.infer<typeof thesis>) =>
  `Por qué: ${t.why}\nPruebas: ${t.evidence}\nFuentes: ${t.sources.join(" · ")}\nPlan: ${t.exit_plan}\nLecciones: ${t.lessons_applied}`;

const tradeMeta = (t: z.infer<typeof thesis>) => ({ thesis: formatThesis(t), lessonsApplied: t.lessons_applied });

// En el laboratorio las lecciones las escribe el analista, no cada agente.
const LAB_FORBIDDEN_TOOLS = new Set(["write_lesson", "delete_lesson", "mark_mission_reviewed"]);

// Llamadas que cuentan como investigación para el registro de posiciones.
const RESEARCH_TOOLS = new Set([
  "scan_market",
  "token_report",
  "http_get",
  "field_guide",
  "quote_solana_swap",
  "recall_lessons",
  "trade_history",
  "journal_history",
]);

// Herramientas del simulador: las comparten el runner por API y el servidor MCP.
export const SIM_TOOLS = [
  tool({
    name: "scan_market",
    description:
      "Escaneo de mercado en Solana en una sola llamada: combina los tokens en tendencia de Jupiter (5 min y 1 h), los que están en directo " +
      "en pump.fun, los promocionados en DexScreener y las tendencias de GeckoTerminal, con sus datos clave (capitalización, liquidez, " +
      "variación de precio, compradores netos, antigüedad). Los que aparecen en más fuentes van primero.",
    schema: z.object({ limit: z.number().int().min(5).max(60).default(25) }),
    run: async ({ limit }) => json(await research.scanMarket(limit)),
  }),
  tool({
    name: "token_report",
    description:
      "Ficha completa de un token de Solana en una sola llamada: actividad de compras y ventas (5 min, 1 h, 24 h), holders, liquidez, " +
      "auditoría (autoridades de mint y freeze, % del creador y de los mayores holders), riesgos de RugCheck, webs y redes sociales del " +
      "proyecto y, si es de pump.fun, su descripción, comentarios y máximo histórico.",
    schema: z.object({ mint: z.string() }),
    run: async ({ mint }) => json(await research.tokenReport(mint.trim())),
  }),
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
      logActivity({ missionId: ctx.missionId, sessionId: ctx.sessionId, kind: "thought", title: entry });
      return "Anotado.";
    },
  }),
  tool({
    name: "mission_status",
    description:
      "Estado de tu misión: capital inicial, objetivo, valor actual de la cartera, cuánto falta y tiempo restante. " +
      "La misión termina sola al alcanzar el objetivo o al acabarse el plazo; entonces se cierran todas las posiciones a mercado.",
    schema: z.object({}),
    run: async (_i, ctx) => json(await mission.missionStatus(ctx.missionId ?? undefined)),
  }),
  tool({
    name: "wait",
    description:
      `Deja pasar tiempo real (1-${MAX_WAIT_MINUTES} minutos) sin hacer nada. Mientras esperas, tus órdenes condicionales se siguen vigilando. ` +
      "Vuelve antes si la misión termina. El tiempo también pasa mientras investigas u operas: no hace falta esperar para que el mercado se mueva.",
    schema: z.object({ minutes: z.number().min(1).max(MAX_WAIT_MINUTES) }),
    run: async ({ minutes }, ctx) => {
      const m = mid(ctx);
      const until = Date.now() + minutes * 60_000;
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, Math.min(20_000, until - Date.now())));
        await orders.checkOrders().catch(() => []);
        await mission.checkMission(m).catch(() => []);
        if (mission.getMission(m)?.status !== "active") {
          return `La misión ha terminado mientras esperabas. Hora: ${now()}\n${json(await mission.missionStatus(m))}`;
        }
      }
      return `Han pasado ${minutes} minutos. Hora actual: ${now()}\n${json(await mission.missionStatus(m))}`;
    },
  }),
  tool({
    name: "http_get",
    description: "Hace una petición HTTP GET y devuelve la respuesta en texto (útil para APIs públicas en JSON).",
    schema: z.object({ url: z.string() }),
    run: async ({ url }) => {
      if (!/^https?:\/\//i.test(url)) throw new Error("Solo se permiten URLs http(s)");
      const { status, body } = await fetchText(url, { timeoutMs: 20_000 });
      return `HTTP ${status}\n${body.slice(0, 20000)}${body.length > 20000 ? `\n… (truncado, ${body.length} caracteres en total)` : ""}`;
    },
  }),

  // ─── Cartera simulada ─────────────────────────────────────────────────────
  tool({
    name: "portfolio",
    description:
      "Muestra tu cartera simulada y su valor en USD a precio de liquidación real ahora mismo, " +
      "el PnL desde el inicio y lo que valdría el capital inicial si se hubiera mantenido en SOL.",
    schema: z.object({}),
    run: async (_i, ctx) => json(await sim.valuation(mid(ctx))),
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
          missionId: mid(ctx),
          sessionId: ctx.sessionId,
          input: i.input,
          output: i.output,
          amount: i.amount,
          slippageBps: i.slippage_bps,
          reasoning: formatThesis(i.thesis),
          meta: tradeMeta(i.thesis),
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
      json(await sim.binanceMarketOrder({ missionId: mid(ctx), sessionId: ctx.sessionId, symbol: i.symbol, side: i.side, amount: i.amount, reasoning: formatThesis(i.thesis), meta: tradeMeta(i.thesis) })),
  }),
  tool({
    name: "simulate_transfer",
    description:
      "Mueve USDC o SOL entre tu monedero de Solana y tu cuenta de Binance, en simulación. " +
      "De Solana a Binance se paga la fee de red; de Binance a Solana, la comisión de retirada de Binance.",
    schema: z.object({ asset: z.enum(["USDC", "SOL"]), from: z.enum(["solana", "binance"]), amount: z.number().positive(), reasoning }),
    run: async (i, ctx) => json(await sim.transfer({ missionId: mid(ctx), sessionId: ctx.sessionId, ...i })),
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
          missionId: mid(ctx),
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
          missionId: mid(ctx),
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
    run: async ({ status }, ctx) => json(orders.listOrders(mid(ctx), status)),
  }),
  tool({
    name: "cancel_order",
    description: "Cancela una orden condicional abierta.",
    schema: z.object({ id: z.number().int() }),
    run: async ({ id }, ctx) => orders.cancelOrder(mid(ctx), id, ctx.sessionId),
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
        missionId: ctx.missionId,
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
    run: async ({ limit, mission_id }, ctx) => {
      const target = mission_id ?? ctx.missionId;
      if (target === null || !mission.getMission(target)) throw new Error(mission_id === undefined ? "No hay misiones" : `No existe la misión #${mission_id}`);
      return json(db.prepare("SELECT ts, kind, summary, reasoning, details FROM journal WHERE mission_id = ? ORDER BY id DESC LIMIT ?").all(target, limit));
    },
  }),

  // ─── Memoria a largo plazo: lecciones entre misiones ──────────────────────
  tool({
    name: "recall_lessons",
    description:
      "Tu memoria entre misiones, ordenada por parecido con la misión actual (plazo, objetivo y enfoque): historial de misiones con su " +
      "resultado, tus lecciones con su contexto y estadísticas reales de tus operaciones cerradas agrupadas por características " +
      "(antigüedad y liquidez del token, si subía mucho al comprar, si investigaste antes…), en todas las misiones y en las parecidas.",
    schema: z.object({}),
    run: async (_i, ctx) => {
      const current = ctx.missionId !== null ? mission.getMission(ctx.missionId) : undefined;
      if (current?.lab_run_id != null) {
        // La memoria del laboratorio es el manual que mantiene el analista (fase 3).
        return "Todavía no hay manual de estrategia del laboratorio: se creará a partir de las próximas tandas.";
      }
      return json(memory.recall(ctx.missionId));
    },
  }),
  tool({
    name: "trade_history",
    description:
      "Tus posiciones (de la misión indicada o de todas): coste, resultado real, tiempo mantenida, motivo de cierre, datos del token al " +
      "entrar (antigüedad, liquidez, variación, holders, riesgos) y cuánto habías investigado antes. Lo registra el simulador.",
    schema: z.object({ mission_id: z.number().int().optional(), limit: z.number().int().min(1).max(200).default(50) }),
    run: async ({ mission_id, limit }, ctx) => {
      // En el laboratorio, sin mission_id se muestran solo las posiciones propias.
      const isLab = ctx.missionId !== null && mission.getMission(ctx.missionId)?.lab_run_id != null;
      return json(positions.listPositions(mission_id ?? (isLab ? ctx.missionId! : undefined)).slice(0, limit));
    },
  }),
  tool({
    name: "mark_mission_reviewed",
    description:
      "Da por revisada una misión terminada cuando, tras analizarla, no aporta ninguna lección nueva. Si aprendiste algo, usa write_lesson.",
    schema: z.object({ mission_id: z.number().int(), note: z.string().min(1).describe("Por qué no hay lecciones nuevas") }),
    run: async ({ mission_id, note }, ctx) => {
      memory.markReviewed(mission_id);
      logJournal({ missionId: mission_id, sessionId: ctx.sessionId, kind: "mission", summary: `Misión #${mission_id} revisada sin lecciones nuevas: ${note}` });
      return `Misión #${mission_id} marcada como revisada.`;
    },
  }),
  tool({
    name: "write_lesson",
    description:
      "Guarda una lección en tu memoria a largo plazo. Se conserva entre misiones y marca la misión como revisada. " +
      "Por defecto se vincula a la misión actual (o a la última si no hay ninguna activa); indica mission_id para otra.",
    schema: z.object({
      lesson: z.string().min(1).describe("Qué aprendiste: qué hiciste, qué pasó y qué harías distinto"),
      applies_to: z.string().min(1).describe("A qué tipo de misión o situación se aplica (plazo, objetivo, enfoque, tipo de token…)"),
      evidence: z.string().min(1).describe("En qué te basas: misiones y operaciones concretas, con sus cifras"),
      confidence: z.enum(["baja", "media", "alta"]).describe("Cuánto confías en ella según la cantidad de pruebas"),
      mission_id: z.number().int().optional(),
    }),
    run: async ({ lesson, applies_to, evidence, confidence, mission_id }, ctx) => {
      const missionId = mission_id ?? ctx.missionId;
      const id = db
        .prepare("INSERT INTO lessons (created_at, mission_id, text, applies_to, evidence, confidence) VALUES (?, ?, ?, ?, ?, ?)")
        .run(now(), missionId, lesson, applies_to, evidence, confidence).lastInsertRowid;
      if (missionId) memory.markReviewed(missionId);
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
      db.prepare("INSERT INTO notes (ts, mission_id, session_id, text) VALUES (?, ?, ?, ?)").run(now(), mid(ctx), ctx.sessionId, text);
      return "Nota guardada.";
    },
  }),
  tool({
    name: "delete_note",
    description: "Borra una nota por su id cuando ya no sea útil.",
    schema: z.object({ id: z.number().int() }),
    run: async ({ id }, ctx) => {
      db.prepare("DELETE FROM notes WHERE id = ? AND mission_id = ?").run(id, mid(ctx));
      return "Nota borrada.";
    },
  }),
];

type AnyTool = (typeof SIM_TOOLS)[number];

export async function runTool(
  name: string,
  rawInput: unknown,
  ctx: ToolCtx,
  tools: readonly AnyTool[] | readonly { name: string }[] = SIM_TOOLS,
): Promise<{ content: ToolOutput; isError: boolean }> {
  const def = (tools as readonly AnyTool[]).find((t) => t.name === name);
  if (!def) return { content: `Herramienta desconocida: ${name}`, isError: true };
  const parsed = def.schema.safeParse(rawInput);
  if (!parsed.success) return { content: `Entrada no válida: ${parsed.error.message}`, isError: true };
  const current = ctx.missionId !== null ? mission.getMission(ctx.missionId) : undefined;
  if (isTradingTool(name) && current?.status !== "active") {
    return { content: `Error: no hay ninguna misión activa. ${(await mission.missionStatus(ctx.missionId ?? undefined)).message ?? ""}`, isError: true };
  }
  // Reglas del laboratorio: la memoria la gestiona el analista, y cada grupo tiene su papel.
  if (current && current.lab_run_id !== null) {
    const group = current.lab_group as mission.LabGroup;
    if (LAB_FORBIDDEN_TOOLS.has(name)) {
      return { content: "Error: en el laboratorio no escribes lecciones; al final de cada tanda un analista revisa todas las operaciones.", isError: true };
    }
    if (name === "recall_lessons" && group === "control") {
      return { content: "Error: tu grupo (control) trabaja sin memoria de misiones anteriores.", isError: true };
    }
    const input = parsed.data as Record<string, unknown>;
    if (name === "trade_history" && input.mission_id !== undefined && input.mission_id !== current.id) {
      return { content: "Error: en el laboratorio solo puedes ver tus propias posiciones.", isError: true };
    }
    if (group === "explorador" && (name === "simulate_solana_swap" || name === "place_solana_trigger_order")) {
      const target = String(input.output ?? "");
      const banned = mission.exploredTokens(current.lab_run_id).find((t) => t.mint === target);
      if (banned) {
        return {
          content: `Error: eres del grupo explorador y ${banned.symbol} (${banned.mint}) ya se operó en tandas anteriores. Busca algo nuevo.`,
          isError: true,
        };
      }
    }
  }
  // Ciclo de aprendizaje (misión principal): no se opera sin haber revisado antes la misión anterior.
  const unreviewed = isTradingTool(name) && current?.lab_run_id === null ? memory.pendingReviews() : [];
  if (unreviewed.length) {
    return {
      content:
        `Error: antes de operar tienes que revisar ${unreviewed.length > 1 ? "las misiones" : "la misión"} #${unreviewed.join(", #")}. ` +
        "Analiza qué pasó (trade_history y journal_history con su mission_id) y guarda lo aprendido con write_lesson, " +
        "o usa mark_mission_reviewed si no aporta nada nuevo.",
      isError: true,
    };
  }
  if (RESEARCH_TOOLS.has(name)) {
    const input = parsed.data as Record<string, unknown>;
    positions.logResearch(ctx.missionId, name, String(input.mint ?? input.url ?? input.output ?? "") || undefined);
  }
  try {
    const content = await (def.run as (i: unknown, c: typeof ctx) => Promise<ToolOutput>)(parsed.data, ctx);
    if (isTradingTool(name)) {
      // Tras cada operación se comprueba si ya se ha alcanzado el objetivo.
      const ended = await mission.checkMission(ctx.missionId ?? undefined).catch(() => []);
      if (ended.length && typeof content === "string") return { content: `${content}\n\n${ended.join("\n")}`, isError: false };
    }
    return { content, isError: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isTradingTool(name)) {
      logJournal({ missionId: ctx.missionId, sessionId: ctx.sessionId, kind: "rejected", summary: `${name} rechazada: ${message}`, details: rawInput });
    }
    return { content: `Error: ${message}`, isError: true };
  }
}

