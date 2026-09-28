import { readFileSync } from "node:fs";
import { z } from "zod";
import { db, logActivity, logJournal, now } from "../db.js";
import { fetchText } from "../market/http.js";
import { CHAINS, VENUES, type ChainId } from "../sim/types.js";
import { getChain } from "../sim/venues/index.js";
import * as mission from "../sim/mission.js";
import * as memory from "../sim/memory.js";
import * as orders from "../sim/orders.js";
import * as positions from "../sim/positions.js";
import * as sim from "../sim/portfolio.js";
import * as transfers from "../sim/transfers.js";
import { estimateTokenLaunch } from "../sim/launch.js";
import { asset } from "../paths.js";
import { json, tool, type ToolCtx, type ToolOutput } from "./define.js";
import { toText } from "./format.js";

/** Misión del contexto; las herramientas que la necesitan solo se ejecutan si existe. */
const mid = (ctx: ToolCtx): number => {
  if (ctx.missionId === null) throw new Error("No hay ninguna misión");
  return ctx.missionId;
};


// Límite prudente para que una llamada MCP no se alargue demasiado.
const MAX_WAIT_MINUTES = 10;

const FIELD_GUIDE = asset("guia-del-terreno.md", "knowledge/guia-del-terreno.md");

const reasoning = z.string().describe("Por qué haces esto. Queda en el diario.");

const chainParam = z.enum(CHAINS as [ChainId, ...ChainId[]]).describe("Cadena en la que operas o investigas");

// Condición de una creencia sobre los datos de entrada de las posiciones.
const conditionSchema = z
  .object({
    all: z
      .array(
        z.object({
          f: z.enum(memory.CONDITION_FIELDS),
          op: z.enum(memory.CONDITION_OPS),
          v: z.union([z.number(), z.string(), z.boolean()]),
        }),
      )
      .min(1),
  })
  .describe('Todas las cláusulas deben cumplirse. Ejemplo: {"all":[{"f":"ageMinutes","op":"<","v":30},{"f":"organicScore","op":">=","v":50}]}');

// Alias de tokens que entiende cada cadena, para las descripciones.
const TOKEN_ALIASES = "en Solana: SOL y USDC; en Base: ETH, WETH y USDC; en BNB Chain (bsc): BNB, WBNB, USDT y USDC";

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
    beliefs_applied: z
      .array(z.number().int())
      .describe("Ids de las creencias de tu memoria que aplicas en esta operación (vacío si ninguna). El simulador medirá cómo le va a cada una"),
    memory_note: z
      .string()
      .min(1)
      .describe("Cómo aplicas tu memoria aquí (creencias, howtos, el briefing del revisor) o por qué nada de ella aplica a esta situación"),
  })
  .describe("Tesis de la operación. Queda en el diario y el usuario la ve en el panel.");

const formatThesis = (t: z.infer<typeof thesis>) =>
  `Por qué: ${t.why}\nPruebas: ${t.evidence}\nFuentes: ${t.sources.join(" · ")}\nPlan: ${t.exit_plan}\nMemoria: ${t.beliefs_applied.length ? `creencias #${t.beliefs_applied.join(", #")}. ` : ""}${t.memory_note}`;

const tradeMeta = (t: z.infer<typeof thesis>) => ({ thesis: formatThesis(t), lessonsApplied: t.memory_note, beliefsApplied: t.beliefs_applied });


// Herramientas del simulador: las comparten el runner por API y el servidor MCP.
export const SIM_TOOLS = [
  tool({
    name: "scan_market",
    kind: "research",
    researchTarget: () => undefined,
    description:
      "Escaneo de mercado de una cadena en una sola llamada, con los datos clave de cada candidato (capitalización, liquidez, " +
      "variación de precio, compradores netos, antigüedad). Los que aparecen en más fuentes van primero. En Solana combina los tokens en " +
      "tendencia de Jupiter (5 min y 1 h), los que están en directo en pump.fun, los promocionados en DexScreener y las tendencias de GeckoTerminal.",
    schema: z.object({ chain: chainParam, limit: z.number().int().min(5).max(60).default(25) }),
    run: async ({ chain, limit }) => toText(await getChain(chain).research.scan(limit)),
  }),
  tool({
    name: "token_report",
    kind: "research",
    researchTarget: (i) => i.token,
    description:
      "Ficha completa de un token en una sola llamada: actividad de compras y ventas (5 min, 1 h, 24 h), holders, liquidez, " +
      "auditoría y riesgos, webs y redes sociales del proyecto. En Solana incluye las autoridades de mint y freeze, el % del creador y de " +
      "los mayores holders, los riesgos de RugCheck y, si es de pump.fun, su descripción, comentarios y máximo histórico.",
    schema: z.object({ chain: chainParam, token: z.string().describe("Dirección del token (en Solana, su mint)") }),
    run: async ({ chain, token }) => json(await getChain(chain).research.report(token.trim())),
  }),
  tool({
    name: "field_guide",
    kind: "research",
    role: "both",
    description:
      "Guía del terreno: qué mercados puede ejecutar el simulador y cómo los simula, cómo funciona pump.fun " +
      "(curva, comisiones, graduación) y qué APIs públicas de datos responden, con sus URLs y campos. Hechos, no recomendaciones.",
    schema: z.object({}),
    run: async () => readFileSync(FIELD_GUIDE, "utf8"),
  }),
  tool({
    name: "log_progress",
    kind: "misc",
    journaled: true,
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
    kind: "misc",
    deliversNews: true,
    description:
      "Estado de tu misión: capital inicial, objetivo, valor actual de la cartera, cuánto falta y tiempo restante. " +
      "La misión termina sola al alcanzar el objetivo o al acabarse el plazo; entonces se cierran todas las posiciones a mercado.",
    schema: z.object({}),
    run: async (_i, ctx) => json(await mission.missionStatus(ctx.missionId ?? undefined)),
  }),
  tool({
    name: "wait",
    kind: "misc",
    deliversNews: true,
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
    kind: "research",
    researchTarget: (i) => i.url,
    description: "Hace una petición HTTP GET y devuelve la respuesta en texto (útil para APIs públicas en JSON).",
    schema: z.object({ url: z.string() }),
    run: async ({ url }) => {
      if (!/^https?:\/\//i.test(url)) throw new Error("Solo se permiten URLs http(s)");
      const { status, body } = await fetchText(url, { timeoutMs: 20_000 });
      memory.recordApiCall(url, status);
      return `HTTP ${status}\n${body.slice(0, 20000)}${body.length > 20000 ? `\n… (truncado, ${body.length} caracteres en total)` : ""}`;
    },
  }),

  // ─── Cartera simulada ─────────────────────────────────────────────────────
  tool({
    name: "portfolio",
    kind: "misc",
    deliversNews: true,
    description:
      "Muestra tu cartera simulada y su valor en USD a precio de liquidación real ahora mismo, " +
      "el PnL desde el inicio, la dirección de tu monedero EVM y una referencia: lo que valdría tu cartera inicial si no hubieras operado.",
    schema: z.object({}),
    run: async (_i, ctx) => json(await sim.valuation(mid(ctx))),
  }),
  tool({
    name: "quote_swap",
    kind: "research",
    researchTarget: (i) => i.output,
    description:
      "Cotiza un swap en una cadena sin ejecutarlo, con el agregador de DEX real de esa cadena (en Solana, Jupiter). " +
      `input/output: dirección del token, o un alias (${TOKEN_ALIASES}). amount en unidades del token de entrada.`,
    schema: z.object({
      chain: chainParam,
      input: z.string(),
      output: z.string(),
      amount: z.number().positive(),
      slippage_bps: z.number().int().min(1).max(5000).default(50),
    }),
    run: async (i, ctx) => json(await sim.quoteSwap(i.chain, i.input, i.output, i.amount, i.slippage_bps, ctx.missionId)),
  }),
  tool({
    name: "simulate_swap",
    kind: "trade",
    journaled: true,
    description:
      "Ejecuta en simulación un swap en tu monedero de una cadena. El resultado es la cotización real del agregador en ese instante " +
      "(liquidez y comisiones de los pools incluidas) y se descuentan los costes de red de esa cadena. " +
      "En Solana: fee de red en SOL y, si recibes un token nuevo, la renta de la cuenta del token (se recupera al vaciarla). " +
      `Necesitas el token nativo de la cadena para pagar la red. input/output: dirección del token o un alias (${TOKEN_ALIASES}). ` +
      "Indica amount (cantidad del token de entrada) o sell_all para vender todo tu saldo de ese token. " +
      "slippage_bps protege la cotización que acabas de ver: si cotizaste este mismo swap con quote_swap hace menos de 60 s y el precio se ha movido " +
      "más que tu slippage, el swap revierte (pagas solo la red). Sin cotización previa, se ejecuta al precio del momento.",
    schema: z.object({
      chain: chainParam,
      input: z.string(),
      output: z.string(),
      amount: z.number().positive().optional(),
      sell_all: z.boolean().optional().describe("Vende todo tu saldo del token de entrada (en lugar de amount)"),
      slippage_bps: z.number().int().min(1).max(5000).default(50),
      thesis,
    }),
    run: async (i, ctx) =>
      json(
        await sim.swap({
          missionId: mid(ctx),
          sessionId: ctx.sessionId,
          chain: i.chain,
          input: i.input,
          output: i.output,
          amount: i.amount,
          sellAll: i.sell_all,
          slippageBps: i.slippage_bps,
          reasoning: formatThesis(i.thesis),
          meta: tradeMeta(i.thesis),
        }),
      ),
  }),
  tool({
    name: "simulate_binance_market_order",
    kind: "trade",
    journaled: true,
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
    kind: "trade",
    journaled: true,
    description:
      "Deposita en Binance desde uno de tus monederos, o retira de Binance a uno de ellos, por la red de esa cadena. " +
      "Redes: USDC por Solana, Base o BNB Chain; USDT por Solana o BNB Chain; SOL por Solana; ETH por Base; BNB por BNB Chain. " +
      "Al depositar pagas la red de la cadena (en su nativo); al retirar, la comisión de retirada de Binance (y hay un mínimo). " +
      "El dinero sale al momento y llega unos minutos después (mientras tanto aparece en tu cartera como en tránsito). " +
      "Entre dos cadenas usa simulate_bridge.",
    schema: z.object({
      asset: z.enum(transfers.TRANSFER_ASSETS),
      from: z.enum(VENUES),
      to: z.enum(VENUES),
      amount: z.number().positive(),
      reasoning,
    }),
    run: async (i, ctx) => json(await transfers.cexTransfer({ missionId: mid(ctx), sessionId: ctx.sessionId, ...i })),
  }),
  tool({
    name: "quote_bridge",
    kind: "research",
    researchTarget: (i) => i.token_out,
    description:
      "Estimación orientativa de un puente entre dos cadenas (Solana, Base, BNB Chain): cuánto recibirías y el gas aproximado. " +
      "No gasta nada. El coste, el gas y la duración reales los da el agregador de puentes al ejecutarlo con simulate_bridge.",
    schema: z.object({
      from_chain: chainParam,
      to_chain: chainParam,
      token_in: z.string().describe(`Token que envías (dirección o alias: ${TOKEN_ALIASES})`),
      token_out: z.string().describe("Token que quieres recibir en la cadena de destino (dirección o alias)"),
      amount: z.number().positive(),
    }),
    run: async (i) => json(await transfers.quoteBridge({ fromChain: i.from_chain, toChain: i.to_chain, tokenIn: i.token_in, tokenOut: i.token_out, amount: i.amount })),
  }),
  tool({
    name: "simulate_bridge",
    kind: "trade",
    journaled: true,
    description:
      "Cruza un puente entre dos cadenas (Solana, Base, BNB Chain) con Li.Fi, que elige el puente y la ruta. Puedes cambiar de token " +
      "por el camino (p. ej. USDC de Base a BNB en BNB Chain). Pagas el gas en la cadena de origen (en su nativo) y la comisión del " +
      "puente va incluida en lo que recibes. El dinero sale al momento y llega cuando indique el puente (segundos o minutos).",
    schema: z.object({
      from_chain: chainParam,
      to_chain: chainParam,
      token_in: z.string().describe(`Token que envías (dirección o alias: ${TOKEN_ALIASES})`),
      token_out: z.string().describe("Token que quieres recibir en la cadena de destino (dirección o alias)"),
      amount: z.number().positive(),
      slippage_bps: z.number().int().min(1).max(5000).default(50),
      thesis,
    }),
    run: async (i, ctx) =>
      json(
        await transfers.bridge({
          missionId: mid(ctx),
          sessionId: ctx.sessionId,
          fromChain: i.from_chain,
          toChain: i.to_chain,
          tokenIn: i.token_in,
          tokenOut: i.token_out,
          amount: i.amount,
          slippageBps: i.slippage_bps,
          reasoning: formatThesis(i.thesis),
          meta: tradeMeta(i.thesis),
        }),
      ),
  }),
  tool({
    name: "place_swap_trigger_order",
    kind: "trade",
    journaled: true,
    description:
      "Deja una orden condicional en una cadena: cuando el precio en USD de trigger_asset cruce trigger_price (above = sube hasta o por encima, " +
      "below = baja hasta o por debajo), se ejecuta el swap indicado a mercado con la cotización real de ese instante. " +
      "Funciona aunque no estés en sesión. El precio se comprueba aproximadamente cada minuto, así que un pico muy breve puede no dispararla. " +
      "El saldo no se bloquea: si al dispararse no hay saldo suficiente, la orden falla. Con sell_all vende todo el saldo que tengas en ese momento. " +
      "Con condition: time se ejecuta dentro de in_minutes pase lo que pase con el precio (sin trigger_asset ni trigger_price): sirve para cumplir tu plan " +
      "(\"si a los 3 min no ha saltado la toma de beneficio, vendo\") aunque no estés pendiente. Cancela la que sobre cuando se ejecute la otra.",
    schema: z.object({
      chain: chainParam,
      trigger_asset: z.string().optional().describe(`Dirección del token cuyo precio se vigila, o un alias (${TOKEN_ALIASES}). No en las de tiempo`),
      condition: z.enum(["above", "below", "time"]),
      trigger_price: z.number().positive().optional().describe("Precio en USD. No en las de tiempo"),
      in_minutes: z.number().positive().optional().describe("Solo con condition: time. Dentro de cuántos minutos se ejecuta"),
      input: z.string(),
      output: z.string(),
      amount: z.number().positive().optional().describe("Cantidad del token de entrada"),
      sell_all: z.boolean().optional().describe("Vender todo el saldo del token de entrada al dispararse (en lugar de amount)"),
      slippage_bps: z.number().int().min(1).max(5000).default(100),
      expires_hours: z.number().positive().optional(),
      thesis,
    }),
    run: async (i, ctx) => {
      if (!i.sell_all && i.amount === undefined) throw new Error("Indica amount o sell_all");
      return json(
        await orders.placeOrder({
          missionId: mid(ctx),
          sessionId: ctx.sessionId,
          venue: i.chain,
          triggerAsset: i.trigger_asset,
          condition: i.condition,
          triggerPrice: i.trigger_price,
          inMinutes: i.in_minutes,
          action: { input: i.input, output: i.output, amount: i.amount ?? 0, sellAll: i.sell_all || undefined, slippageBps: i.slippage_bps },
          expiresHours: i.expires_hours,
          reasoning: formatThesis(i.thesis),
        }),
      );
    },
  }),
  tool({
    name: "place_binance_trigger_order",
    kind: "trade",
    journaled: true,
    description:
      "Deja una orden condicional en Binance: cuando el último precio de trigger_symbol cruce trigger_price, se ejecuta la orden de mercado " +
      "indicada contra el order book real de ese instante. Funciona aunque no estés en sesión; se comprueba aproximadamente cada minuto. " +
      "El saldo no se bloquea: si al dispararse no hay saldo suficiente, la orden falla. Con condition: time se ejecuta dentro de in_minutes, " +
      "pase lo que pase con el precio (sin trigger_symbol ni trigger_price).",
    schema: z.object({
      trigger_symbol: z.string().optional().describe("Par de Binance cuyo precio se vigila, p. ej. SOLUSDC. No en las de tiempo"),
      condition: z.enum(["above", "below", "time"]),
      trigger_price: z.number().positive().optional().describe("Precio en el activo quote del par. No en las de tiempo"),
      in_minutes: z.number().positive().optional().describe("Solo con condition: time. Dentro de cuántos minutos se ejecuta"),
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
          inMinutes: i.in_minutes,
          action: { symbol: i.symbol, side: i.side, amount: i.amount },
          expiresHours: i.expires_hours,
          reasoning: formatThesis(i.thesis),
        }),
      ),
  }),
  tool({
    name: "list_orders",
    kind: "misc",
    description: "Lista tus órdenes condicionales: abiertas, cerradas (ejecutadas, fallidas, canceladas, caducadas) o todas.",
    schema: z.object({ status: z.enum(["open", "closed", "all"]).default("open") }),
    run: async ({ status }, ctx) => toText(orders.listOrders(mid(ctx), status)),
  }),
  tool({
    name: "cancel_order",
    kind: "misc",
    journaled: true,
    description: "Cancela una orden condicional abierta.",
    schema: z.object({ id: z.number().int() }),
    run: async ({ id }, ctx) => orders.cancelOrder(mid(ctx), id, ctx.sessionId),
  }),
  tool({
    name: "estimate_token_launch",
    kind: "research",
    description:
      "Cuánto costaría lanzar un token propio en una cadena, con el gas y los precios de ahora: en Solana con pump.fun; en Base " +
      "y BNB Chain, desplegando un ERC-20 y creando su pool con la liquidez que indiques. El simulador no crea tokens (su mercado " +
      "depende de otras personas): si decides hacerlo, anótalo con record_hypothetical_action incluyendo esta estimación.",
    schema: z.object({
      chain: chainParam,
      initial_liquidity_usd: z.number().min(0).optional().describe("Liquidez inicial (o primera compra en pump.fun), en USD"),
    }),
    run: async (i) => json(await estimateTokenLaunch({ chain: i.chain, initialLiquidityUsd: i.initial_liquidity_usd })),
  }),
  tool({
    name: "record_hypothetical_action",
    kind: "misc",
    journaled: true,
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
    kind: "memory",
    researchTarget: () => undefined,
    description:
      "Devuelve las últimas entradas de tu diario de operaciones. Por defecto, de la misión actual; " +
      "con mission_id, las de una misión anterior (útil para analizarla y sacar lecciones).",
    schema: z.object({ limit: z.number().int().min(1).max(200).default(30), mission_id: z.number().int().optional() }),
    run: async ({ limit, mission_id }, ctx) => {
      const target = mission_id ?? ctx.missionId;
      if (target === null || !mission.getMission(target)) throw new Error(mission_id === undefined ? "No hay misiones" : `No existe la misión #${mission_id}`);
      return toText(db.prepare("SELECT ts, kind, summary, reasoning, details FROM journal WHERE mission_id = ? ORDER BY id DESC LIMIT ?").all(target, limit));
    },
  }),

  // ─── Memoria entre misiones (el agente que opera la lee; la escribe el revisor) ─
  tool({
    name: "recall_memory",
    kind: "memory",
    role: "trader",
    researchTarget: () => undefined,
    description:
      "Tu memoria entre misiones, ordenada por parecido con la misión actual. La escribe un agente revisor a partir de lo que pasó " +
      "en tus misiones. Incluye: howtos (cómo se hace algo y qué errores evitar), creencias sobre el mercado con su evidencia real " +
      "(calculada por el simulador con tus operaciones), el historial de misiones con lo que conviene hacer la próxima vez, " +
      "estadísticas de tus operaciones, los errores que se repiten y qué APIs han respondido bien. Por defecto, un resumen con lo más " +
      "relevante (textos recortados); con detail: completo, todo sin recortar.",
    schema: z.object({ detail: z.enum(["resumen", "completo"]).default("resumen") }),
    run: async ({ detail }, ctx) => toText(detail === "completo" ? memory.recall(ctx.missionId) : memory.recallSummary(ctx.missionId)),
  }),
  tool({
    name: "trade_history",
    kind: "memory",
    role: "trader",
    researchTarget: () => undefined,
    description:
      "Tus posiciones (de la misión indicada o de todas): coste, resultado real, tiempo mantenida, motivo de cierre, datos del token al " +
      "entrar (antigüedad, liquidez, variación, holders, riesgos), cuánto habías investigado antes, tu tesis y las creencias que aplicaste.",
    schema: z.object({ mission_id: z.number().int().optional(), limit: z.number().int().min(1).max(200).default(50) }),
    run: async ({ mission_id, limit }) => toText(positions.listPositions(mission_id).slice(0, limit)),
  }),
  tool({
    name: "report_observation",
    kind: "memory",
    role: "trader",
    journaled: true,
    description:
      "Deja una observación para el revisor, que decidirá si pasa a tu memoria: algo que has descubierto sobre cómo se hace algo, " +
      "un error y cómo lo has resuelto, un patrón del mercado que te ha llamado la atención… Úsala en cuanto lo veas, no al final.",
    schema: z.object({
      kind: z.enum(["procedimiento", "mercado", "error", "otro"]),
      text: z.string().min(1).describe("Qué has observado, con datos concretos"),
    }),
    run: async ({ kind, text }, ctx) => `Observación #${memory.reportObservation(ctx.missionId, ctx.sessionId, kind, text)} anotada para el revisor.`,
  }),
  tool({
    name: "request_capability",
    kind: "memory",
    role: "both",
    journaled: true,
    description:
      "Anota una capacidad que no tienes y que necesitarías para intentar algo: una cuenta (X, Instagram, Telegram, un exchange…), " +
      "una herramienta (navegador con sesión iniciada, un bot, una API de pago…), unos datos o un mercado que el simulador no permite. " +
      "El usuario revisa estas peticiones y puede dártelas en el futuro. Explica qué harías exactamente con ella. No sustituye a " +
      "record_hypothetical_action: esa anota lo que harías; esta, lo que te falta para poder hacerlo.",
    schema: z.object({
      category: z.enum(memory.CAPABILITY_CATEGORIES),
      capability: z.string().min(1).describe("Qué necesitas, en pocas palabras (p. ej. 'cuenta de X para publicar')"),
      why: z.string().min(1).describe("Por qué lo necesitas: qué has intentado sin ello y por qué no basta"),
      plan: z.string().min(1).describe("Qué harías con ello, paso a paso, y qué esperas conseguir"),
    }),
    run: async (i, ctx) => {
      const r = memory.requestCapability({ source: "trader", missionId: ctx.missionId, ...i });
      return r.duplicate
        ? `Ya estaba pedida (#${r.id}): se suma tu petición. El usuario la verá.`
        : `Petición #${r.id} anotada. El usuario la verá en el panel y en /cryptoagent:estado.`;
    },
  }),

  // ─── Revisor: lee todo lo ocurrido y escribe la memoria ────────────────────
  tool({
    name: "review_queue",
    kind: "memory",
    role: "reviewer",
    description:
      "Lo que tienes pendiente como revisor: misiones terminadas sin retrospectiva, la misión activa (actividad desde tu última revisión, " +
      "cada cuánto conviene revisarla y si tiene briefing), observaciones del agente sin procesar, errores repetidos sin howto y creencias sin condición.",
    schema: z.object({}),
    run: async () => toText(memory.reviewQueue()),
  }),
  tool({
    name: "mission_review_data",
    kind: "memory",
    role: "reviewer",
    description:
      "Todo lo ocurrido en una misión en una sola llamada: misión, estadísticas, posiciones (con tesis, creencias aplicadas, datos de entrada " +
      "y resultado), diario, registro de trabajo del agente, notas, observaciones, errores, briefing y tus revisiones anteriores. " +
      "Con since (fecha ISO) solo lo posterior a esa fecha (útil a mitad de misión).",
    schema: z.object({ mission_id: z.number().int(), since: z.string().optional() }),
    run: async ({ mission_id, since }) => toText(memory.missionReviewData(mission_id, since)),
  }),
  tool({
    name: "memory_catalog",
    kind: "memory",
    role: "reviewer",
    description:
      "La memoria completa tal como la ve el agente (howtos, creencias activas con su evidencia calculada, historial, estadísticas, errores " +
      "repetidos, APIs), ordenada por parecido con la misión indicada o la activa.",
    schema: z.object({ mission_id: z.number().int().optional() }),
    run: async ({ mission_id }, ctx) => toText(memory.recall(mission_id ?? ctx.missionId)),
  }),
  tool({
    name: "wait_for_activity",
    kind: "memory",
    role: "reviewer",
    description:
      "Espera (1-10 minutos) a que haya algo que revisar en la misión activa. Vuelve antes si la misión termina (reason: mission_ended), " +
      "si toca la revisión periódica (interval_due) o si el agente ha acumulado actividad (activity). Si no, reason: timeout.",
    schema: z.object({ max_minutes: z.number().min(1).max(10).default(10) }),
    run: async ({ max_minutes }) => json(await memory.waitForActivity(max_minutes)),
  }),
  tool({
    name: "write_howto",
    kind: "memory",
    role: "reviewer",
    journaled: true,
    description:
      "Guarda conocimiento procedimental: cómo se hace algo en el simulador o en el mercado, qué falla y cómo evitarlo. " +
      "scope: la cadena o exchange (solana, base, bsc, binance) o 'any'. Con fixes_error_ids lo vinculas a los errores que resuelve. " +
      "Si ya hay uno casi igual, se rechaza: actualízalo con update_howto.",
    schema: z.object({
      scope: z.string().min(1),
      topic: z.string().min(1).describe("Tema corto: 'órdenes condicionales', 'transferencias', 'comisiones'…"),
      title: z.string().min(1),
      steps: z.string().min(1).describe("Pasos concretos o regla práctica, con los datos que la respaldan"),
      mission_id: z.number().int().optional().describe("Misión de la que sale"),
      fixes_error_ids: z.array(z.number().int()).optional(),
    }),
    run: async (i) => {
      const id = memory.writeHowto({ scope: i.scope, topic: i.topic, title: i.title, steps: i.steps, missionId: i.mission_id ?? null, fixesErrorIds: i.fixes_error_ids });
      return `Howto #${id} guardado.`;
    },
  }),
  tool({
    name: "update_howto",
    kind: "memory",
    role: "reviewer",
    journaled: true,
    description: "Corrige un howto, o márcalo obsoleto (status: obsolete, con superseded_by si otro lo sustituye).",
    schema: z.object({
      id: z.number().int(),
      title: z.string().optional(),
      steps: z.string().optional(),
      status: z.enum(["active", "obsolete"]).optional(),
      superseded_by: z.number().int().optional(),
      fixes_error_ids: z.array(z.number().int()).optional(),
    }),
    run: async (i) => {
      memory.updateHowto({ id: i.id, title: i.title, steps: i.steps, status: i.status, supersededBy: i.superseded_by, fixesErrorIds: i.fixes_error_ids });
      return `Howto #${i.id} actualizado.`;
    },
  }),
  tool({
    name: "write_belief",
    kind: "memory",
    role: "reviewer",
    journaled: true,
    description:
      "Guarda una creencia sobre el mercado (una hipótesis, no un hecho). Si puedes expresarla como condición sobre los datos de entrada " +
      "de las posiciones, añádela: el simulador la contrastará con todas las operaciones pasadas y futuras (devuelve el resultado al momento). " +
      `Campos de la condición: ${memory.CONDITION_FIELDS.join(", ")}. Con condición, expectation dice si cumplirla tiende a ganar (positive) o a perder (negative). ` +
      "Si ya hay una casi igual o con la misma condición, se rechaza: corrígela con revise_belief.",
    schema: z.object({
      statement: z.string().min(1).describe("La creencia, con los datos que la originan"),
      applies_to: z.string().min(1).describe("A qué misiones o situaciones se aplica"),
      expectation: z.enum(["positive", "negative"]).optional(),
      condition: conditionSchema.optional(),
      mission_id: z.number().int().optional().describe("Misión de la que sale"),
    }),
    run: async (i) =>
      json(memory.writeBelief({ statement: i.statement, appliesTo: i.applies_to, expectation: i.expectation, condition: i.condition, missionId: i.mission_id ?? null })),
  }),
  tool({
    name: "revise_belief",
    kind: "memory",
    role: "reviewer",
    journaled: true,
    description:
      "Corrige una creencia (texto, alcance, condición o expectativa) o retírala (retire: true) cuando los datos la contradigan. " +
      "No se borra: queda retirada con su motivo. Devuelve su evidencia recalculada.",
    schema: z.object({
      id: z.number().int(),
      statement: z.string().optional(),
      applies_to: z.string().optional(),
      expectation: z.enum(["positive", "negative"]).optional(),
      condition: conditionSchema.optional(),
      clear_condition: z.boolean().optional(),
      retire: z.boolean().optional(),
      reason: z.string().min(1).describe("Por qué la cambias"),
    }),
    run: async (i) =>
      json(
        memory.reviseBelief({
          id: i.id,
          statement: i.statement,
          appliesTo: i.applies_to,
          expectation: i.expectation,
          condition: i.condition,
          clearCondition: i.clear_condition,
          retire: i.retire,
          reason: i.reason,
        }),
      ),
  }),
  tool({
    name: "convert_belief_to_howto",
    kind: "memory",
    role: "reviewer",
    journaled: true,
    description: "Convierte en howto una creencia que en realidad es conocimiento procedimental (cómo funciona algo), no una hipótesis de mercado.",
    schema: z.object({ id: z.number().int(), scope: z.string().min(1), topic: z.string().min(1), title: z.string().min(1), steps: z.string().min(1) }),
    run: async (i) => `Creencia #${i.id} convertida en el howto #${memory.convertBeliefToHowto(i)}.`,
  }),
  tool({
    name: "resolve_observation",
    kind: "memory",
    role: "reviewer",
    description: "Marca una observación del agente como usada (pasó a la memoria) o descartada, con una nota.",
    schema: z.object({ id: z.number().int(), status: z.enum(["used", "dismissed"]), note: z.string().min(1) }),
    run: async ({ id, status, note }) => {
      memory.resolveObservation(id, status, note);
      return `Observación #${id}: ${status}.`;
    },
  }),
  tool({
    name: "write_mission_review",
    kind: "memory",
    role: "reviewer",
    journaled: true,
    description:
      "Retrospectiva de una misión terminada: qué se intentó, qué pasó (con cifras), qué sorprendió y qué conviene hacer la próxima vez. " +
      "Devuelve las estadísticas de la misión calculadas por el simulador.",
    schema: z.object({
      mission_id: z.number().int(),
      what_was_tried: z.string().min(1),
      what_happened: z.string().min(1),
      surprises: z.string().optional(),
      next_time: z.string().min(1),
    }),
    run: async (i) =>
      json(memory.writeMissionReview({ missionId: i.mission_id, whatWasTried: i.what_was_tried, whatHappened: i.what_happened, surprises: i.surprises, nextTime: i.next_time })),
  }),
  tool({
    name: "mark_mission_reviewed",
    kind: "memory",
    role: "reviewer",
    description: "Da por revisada una misión terminada que no llegó a tener operaciones (no hay nada que analizar).",
    schema: z.object({ mission_id: z.number().int(), note: z.string().min(1) }),
    run: async ({ mission_id, note }) => {
      memory.markEmptyMissionReviewed(mission_id, note);
      return `Misión #${mission_id} marcada como revisada.`;
    },
  }),
  tool({
    name: "review_checkpoint",
    kind: "memory",
    role: "reviewer",
    description:
      "Marca que has revisado la misión activa hasta ahora, con un resumen breve de lo que has visto y hecho. " +
      "La siguiente revisión partirá de aquí (mission_review_data con since).",
    schema: z.object({ mission_id: z.number().int(), summary: z.string().min(1) }),
    run: async ({ mission_id, summary }) => {
      memory.reviewCheckpoint(mission_id, summary);
      return "Revisión anotada.";
    },
  }),
  tool({
    name: "write_briefing",
    kind: "memory",
    role: "reviewer",
    description:
      "Escribe (o reescribe) el briefing de una misión: lo que el agente debe tener presente de su memoria para esa misión en concreto, " +
      "citando los ids de howtos y creencias. El agente lo recibe al empezar cada sesión y, si lo cambias a mitad de misión, en su siguiente acción.",
    schema: z.object({ mission_id: z.number().int(), text: z.string().min(1) }),
    run: async ({ mission_id, text }) => {
      memory.writeBriefing(mission_id, text);
      return `Briefing de la misión #${mission_id} guardado.`;
    },
  }),

  // ─── Usuario: peticiones de capacidades ───────────────────────────────────
  tool({
    name: "capability_requests",
    kind: "misc",
    role: "user",
    description: "[Solo para el usuario] Capacidades que el agente ha pedido (cuentas, herramientas, datos, mercados), con cuántas veces y en qué misiones.",
    schema: z.object({ status: z.enum(["open", "all"]).default("open") }),
    run: async ({ status }) => json(memory.listCapabilityRequests(status)),
  }),
  tool({
    name: "resolve_capability_request",
    kind: "misc",
    role: "user",
    description: "[Solo para el usuario] Responde a una petición del agente: aceptada, rechazada o hecha, con una nota.",
    schema: z.object({ id: z.number().int(), status: z.enum(["accepted", "rejected", "done"]), response: z.string().min(1) }),
    run: async ({ id, status, response }) => {
      memory.resolveCapabilityRequest(id, status, response);
      return `Petición #${id}: ${status}.`;
    },
  }),

  // ─── Memoria entre sesiones y tiempo ──────────────────────────────────────
  tool({
    name: "write_note",
    kind: "memory",
    journaled: true,
    description: "Guarda una nota para ti mismo. Las notas se te muestran al empezar cada sesión futura.",
    schema: z.object({ text: z.string() }),
    run: async ({ text }, ctx) => {
      db.prepare("INSERT INTO notes (ts, mission_id, session_id, text) VALUES (?, ?, ?, ?)").run(now(), mid(ctx), ctx.sessionId, text);
      return "Nota guardada.";
    },
  }),
  tool({
    name: "delete_note",
    kind: "memory",
    journaled: true,
    description: "Borra una nota por su id cuando ya no sea útil.",
    schema: z.object({ id: z.number().int() }),
    run: async ({ id }, ctx) => {
      db.prepare("DELETE FROM notes WHERE id = ? AND mission_id = ?").run(id, mid(ctx));
      return "Nota borrada.";
    },
  }),
];

type AnyTool = (typeof SIM_TOOLS)[number];

/** Añade al resultado el briefing del revisor si ha cambiado desde la última vez que lo vio el agente. */
function withNews(content: ToolOutput, missionId: number | null): ToolOutput {
  if (missionId === null || typeof content !== "string") return content;
  const news = memory.takeBriefingNews(missionId);
  return news ? `${content}\n\n📌 El revisor ha actualizado tu briefing para esta misión:\n${news}` : content;
}

export async function runTool(
  name: string,
  rawInput: unknown,
  ctx: ToolCtx,
  tools: readonly AnyTool[] | readonly { name: string }[] = SIM_TOOLS,
): Promise<{ content: ToolOutput; isError: boolean }> {
  const def = (tools as readonly AnyTool[]).find((t) => t.name === name);
  if (!def) return { content: `Herramienta desconocida: ${name}`, isError: true };
  const fail = (message: string) => {
    // Los errores se guardan para que el revisor detecte los que se repiten y escriba cómo evitarlos.
    memory.recordToolError({ missionId: ctx.missionId, sessionId: ctx.sessionId, tool: name, input: rawInput, message });
    return { content: `Error: ${message}`, isError: true };
  };
  const parsed = def.schema.safeParse(rawInput);
  if (!parsed.success) return fail(`Entrada no válida: ${parsed.error.message}`);
  const trading = def.kind === "trade";
  const current = ctx.missionId !== null ? mission.getMission(ctx.missionId) : undefined;
  if (trading && current?.status !== "active") {
    return { content: `Error: no hay ninguna misión activa. ${(await mission.missionStatus(ctx.missionId ?? undefined)).message ?? ""}`, isError: true };
  }
  const beliefs = (parsed.data as { thesis?: { beliefs_applied?: number[] } }).thesis?.beliefs_applied;
  if (beliefs?.length) {
    const unknown = memory.unknownBeliefs(beliefs);
    if (unknown.length) return fail(`Las creencias #${unknown.join(", #")} no existen o ya no están activas. Activas: ${memory.activeBeliefIds().map((id) => `#${id}`).join(", ") || "ninguna"}`);
  }
  // Antes de operar o de mirar la cartera, lo que ya ha llegado de una transferencia está disponible.
  if (trading || def.deliversNews) await transfers.settleTransfers({ missionId: ctx.missionId ?? undefined }).catch(() => []);
  if (def.researchTarget) {
    positions.logResearch(ctx.missionId, name, (def.researchTarget as (i: unknown) => string | undefined)(parsed.data)?.trim() || undefined);
  }
  try {
    let content = await (def.run as (i: unknown, c: typeof ctx) => Promise<ToolOutput>)(parsed.data, ctx);
    if (trading) {
      // Tras cada operación se comprueba si ya se ha alcanzado el objetivo.
      const ended = await mission.checkMission(ctx.missionId ?? undefined).catch(() => []);
      if (ended.length && typeof content === "string") content = `${content}\n\n${ended.join("\n")}`;
    }
    if (trading || def.deliversNews) content = withNews(content, ctx.missionId);
    return { content, isError: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (trading) {
      logJournal({ missionId: ctx.missionId, sessionId: ctx.sessionId, kind: "rejected", summary: `${name} rechazada: ${message}`, details: rawInput });
    }
    return fail(message);
  }
}
