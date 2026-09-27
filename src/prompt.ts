// El prompt del agente tiene una sola fuente: plugin/agents/trader.md. El runner por API usa el mismo
// texto sin el frontmatter y sin las líneas marcadas con <!-- solo-plugin --> (herramientas de Claude Code).
import { readFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./paths.js";

export const TRADER_PROMPT_PATH = path.join(projectRoot, "plugin", "agents", "trader.md");

const PLUGIN_ONLY = "<!-- solo-plugin -->";

export function buildPrompt(markdown: string, variant: "plugin" | "api"): string {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  const lines = body.split(/\r?\n/);
  const kept =
    variant === "api"
      ? lines.filter((l) => !l.includes(PLUGIN_ONLY))
      : lines.map((l) => l.replace(` ${PLUGIN_ONLY}`, "").replace(PLUGIN_ONLY, ""));
  return kept.join("\n").trim();
}

/** Prompt del agente para el runner por API. */
export function apiSystemPrompt(): string {
  return (
    buildPrompt(readFileSync(TRADER_PROMPT_PATH, "utf8"), "api") +
    "\n\nCuando la misión haya terminado, responde sin usar herramientas: tu última respuesta cierra la sesión."
  );
}
