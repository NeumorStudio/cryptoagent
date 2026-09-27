import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { logActivity } from "./db.js";
import { apiSystemPrompt } from "./prompt.js";
import { getActiveMission, getLastMission } from "./sim/mission.js";
import { endSession, sessionBriefing, startSession } from "./sim/session.js";
import { runTool, toolDefinitions, type AgentRole } from "./tools/runner.js";

// Los prompts se leen de plugin/agents/*.md (una sola fuente para el plugin y el runner por API).
const SYSTEM_PROMPTS: Record<AgentRole, string> = { trader: apiSystemPrompt("trader"), reviewer: apiSystemPrompt("reviewer") };

const FALLBACK_MODELS = new Set(["claude-opus-5", "claude-fable-5-1"]);

const client = new Anthropic();

function log(tag: string, text: string) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${tag} ${text}`);
}

/**
 * Una sesión de un agente sobre una misión (por defecto, la activa o la última).
 * El trader empieza con su briefing; el revisor, con la tarea que se le pida ("Prepara la misión.", "Vigila la misión.").
 */
export async function runSession(opts: { role?: AgentRole; missionId?: number | null; task?: string } = {}): Promise<void> {
  const role = opts.role ?? "trader";
  const missionId = opts.missionId !== undefined ? opts.missionId : ((getActiveMission() ?? getLastMission())?.id ?? null);
  const sessionId = startSession(missionId);
  log("▶", `Sesión #${sessionId} (${role === "trader" ? "trader" : "revisor"}) iniciada`);

  const first = role === "trader" ? await sessionBriefing(sessionId, missionId) : (opts.task ?? "Prepara la misión.");
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: first }];
  const useFallbacks = FALLBACK_MODELS.has(config.model);
  const tools = toolDefinitions(role).map((t) => ("input_schema" in t ? { ...t, eager_input_streaming: true } : t));
  const SYSTEM_PROMPT = SYSTEM_PROMPTS[role];

  let inputTokens = 0;
  let outputTokens = 0;
  let finalText = "";
  let jsonRetries = 0;

  for (let step = 1; step <= config.maxStepsPerSession; step++) {
    const stream = client.beta.messages.stream({
      model: config.model,
      max_tokens: 64000,
      system: SYSTEM_PROMPT,
      tools,
      messages,
      // "summarized": el razonamiento resumido se guarda para el panel.
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: config.effort },
      cache_control: { type: "ephemeral" },
      context_management: { edits: [{ type: "compact_20260112" }] },
      betas: ["compact-2026-01-12", ...(useFallbacks ? ["server-side-fallback-2026-07-01"] : [])],
      ...(useFallbacks ? { fallbacks: "default" as const } : {}),
    });

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Con eager_input_streaming, un input de herramienta ilegible rechaza aquí: se reintenta el turno.
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
      log("⚠", "Entrada de herramienta ilegible, se repite el turno");
      step--;
      continue;
    }

    inputTokens += message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0);
    outputTokens += message.usage.output_tokens;
    messages.push({ role: "assistant", content: message.content });

    for (const block of message.content) {
      if (block.type === "thinking" && block.thinking.trim()) {
        logActivity({ missionId, sessionId, kind: "thinking", title: block.thinking.trim() });
      }
      if (block.type === "text" && block.text.trim()) {
        log("💬", block.text.trim());
        logActivity({ missionId, sessionId, kind: "text", title: block.text.trim() });
      }
      if (block.type === "server_tool_use") {
        log("🔎", `${block.name} ${JSON.stringify(block.input)}`);
        logActivity({ missionId, sessionId, kind: "tool", title: block.name, body: JSON.stringify(block.input) });
      }
    }

    if (message.stop_reason === "refusal") {
      log("⛔", `El modelo rechazó continuar (${message.stop_details?.category ?? "sin categoría"})`);
      break;
    }
    if (message.stop_reason === "pause_turn") continue;
    if (message.stop_reason === "max_tokens") throw new Error("Respuesta cortada por max_tokens");

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      finalText = message.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      break;
    }

    const results: Anthropic.Beta.BetaContentBlockParam[] = await Promise.all(
      toolUses.map(async (use) => {
        log("🛠", `${use.name} ${JSON.stringify(use.input).slice(0, 300)}`);
        if (use.name !== "log_progress") logActivity({ missionId, sessionId, kind: "tool", title: use.name, body: JSON.stringify(use.input) });
        const { content, isError } = await runTool(role, use.name, use.input, { sessionId, missionId });
        if (isError) log("✖", String(content).slice(0, 300));
        if (use.name !== "log_progress") {
          const text = typeof content === "string" ? content : "[contenido no textual]";
          logActivity({ missionId, sessionId, kind: isError ? "error" : "result", title: use.name, body: text.slice(0, 4000) });
        }
        return { type: "tool_result" as const, tool_use_id: use.id, content, is_error: isError };
      }),
    );
    const remaining = config.maxStepsPerSession - step;
    if (remaining <= 3) {
      results.push({ type: "text", text: `Aviso del sistema: te quedan ${remaining} pasos en esta sesión.` });
    }
    messages.push({ role: "user", content: results });
  }

  const end = await endSession(sessionId, missionId, finalText, { input: inputTokens, output: outputTokens });
  log(
    "■",
    `Sesión #${sessionId} terminada. ` +
      (end ? `Cartera: ${end.totalUsd.toFixed(2)} USD (${end.pnlPct.toFixed(2)} %), referencia (${end.benchmarkLabel}): ${end.benchmarkUsd.toFixed(2)} USD. ` : "") +
      `Tokens: ${inputTokens} entrada / ${outputTokens} salida`,
  );
}
