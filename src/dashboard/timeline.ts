// Línea de tiempo del agente para el panel. Une tres fuentes:
//  1. El registro de sesiones de Claude Code (~/.claude/projects/*/*/subagents/*.jsonl), en cualquier
//     proyecto: búsquedas, páginas que abre, peticiones y textos del subagente `trader`. Es un formato
//     interno de Claude Code; si cambia, esta parte puede dejar de leerse, pero el resto sigue.
//  2. La tabla `activity`: registro de trabajo (log_progress) y, con el runner por API, todo su razonamiento.
//  3. El diario del simulador y las notas: operaciones, órdenes, misiones.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { db } from "../db.js";

export type EventKind =
  | "thought"
  | "thinking"
  | "text"
  | "search"
  | "browse"
  | "fetch"
  | "tool"
  | "result"
  | "error"
  | "trade"
  | "order"
  | "hypothetical"
  | "mission"
  | "note"
  | "lesson"
  | "session";

export interface TimelineEvent {
  id: string;
  ts: string;
  kind: EventKind;
  title: string;
  /** Motivo o tesis de una operación: se muestra siempre visible. */
  note?: string;
  body?: string;
}

const projectsDir = path.join(os.homedir(), ".claude", "projects");
// El agente se llama `trader` en el proyecto y `cryptoagent:trader` dentro del plugin.
const TRADER_AGENT = /(^|:)trader$/;
// Las herramientas se llaman mcp__cryptosim__* en el proyecto y mcp__plugin_cryptoagent_cryptosim__* en el plugin.
const normalizeTool = (name: string) => name.replace(/^mcp__plugin_.*?_cryptosim__/, "mcp__cryptosim__");

// Herramientas del simulador cuyo efecto ya aparece en el diario o en la bitácora (se evitan duplicados).
const COVERED_BY_DB = /^mcp__cryptosim__(simulate_|place_|cancel_order|record_hypothetical_action|log_progress|write_note|delete_note|write_lesson|delete_lesson)/;

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b: any) => (b?.type === "text" ? b.text : b?.type === "image" ? "[captura de pantalla]" : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

const short = (s: unknown, n = 140) => {
  const str = typeof s === "string" ? s : JSON.stringify(s ?? "");
  return str.length > n ? str.slice(0, n) + "…" : str;
};

function describeToolUse(rawName: string, input: any): { kind: EventKind; title: string } | null {
  const name = normalizeTool(rawName);
  if (name === "ToolSearch" || name === "SubagentHandback" || COVERED_BY_DB.test(name)) return null;
  if (name === "WebSearch") return { kind: "search", title: `Busca en internet: «${input.query}»` };
  if (name === "WebFetch") return { kind: "fetch", title: `Lee ${input.url}` };
  if (name === "mcp__cryptosim__http_get") return { kind: "fetch", title: `Consulta ${input.url}` };
  if (name === "mcp__cryptosim__start_session") return { kind: "session", title: "Empieza una sesión de trabajo" };
  if (name === "mcp__cryptosim__end_session") return { kind: "session", title: "Cierra la sesión" };
  if (name === "mcp__cryptosim__recall_lessons") return { kind: "tool", title: "Repasa su memoria de misiones anteriores" };
  if (name === "mcp__cryptosim__wait") return { kind: "tool", title: `Espera ${input.minutes} min` };
  if (name.startsWith("mcp__cryptosim__")) return { kind: "tool", title: `Consulta ${name.replace("mcp__cryptosim__", "").replace(/_/g, " ")}` };

  const browser = name.match(/^mcp__Claude_Browser__(.+)$/)?.[1];
  if (browser) {
    switch (browser) {
      case "navigate":
        return { kind: "browse", title: `Abre ${input.url}` };
      case "get_page_text":
      case "read_page":
        return { kind: "browse", title: "Lee la página" };
      case "find":
        return { kind: "browse", title: `Busca en la página: «${input.query}»` };
      case "computer":
        return { kind: "browse", title: `Navegador: ${input.action}${input.text ? ` «${short(input.text, 60)}»` : ""}` };
      case "form_input":
        return { kind: "browse", title: "Rellena un campo de la página" };
      case "javascript_tool":
        return { kind: "browse", title: "Inspecciona la página con JavaScript" };
      case "browser_batch":
        return { kind: "browse", title: `Navegador: ${input.actions?.length ?? "varias"} acciones seguidas` };
      default:
        return { kind: "browse", title: `Navegador: ${browser.replace(/_/g, " ")}` };
    }
  }
  return { kind: "tool", title: name };
}

// Caché por archivo: solo se vuelve a leer si ha cambiado.
const fileCache = new Map<string, { mtimeMs: number; size: number; events: TimelineEvent[] }>();

function parseTranscript(file: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const byToolId = new Map<string, TimelineEvent>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // línea a medio escribir
    }
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const [i, block] of content.entries()) {
      if (entry.type === "assistant" && block.type === "text" && block.text?.trim()) {
        events.push({ id: `${entry.uuid}:${i}`, ts: entry.timestamp, kind: "text", title: block.text.trim() });
      } else if (entry.type === "assistant" && block.type === "tool_use") {
        const d = describeToolUse(block.name, block.input ?? {});
        if (!d) continue;
        const ev: TimelineEvent = { id: block.id, ts: entry.timestamp, ...d };
        byToolId.set(block.id, ev);
        events.push(ev);
      } else if (block.type === "tool_result") {
        const ev = byToolId.get(block.tool_use_id);
        if (!ev) continue;
        const text = resultText(block.content).trim();
        if (text) ev.body = text.length > 3000 ? text.slice(0, 3000) + "\n…" : text;
        if (block.is_error) ev.kind = "error";
      }
    }
  }
  return events;
}

function transcriptEvents(since: string): TimelineEvent[] {
  if (!existsSync(projectsDir)) return [];
  const sinceMs = new Date(since).getTime();
  const events: TimelineEvent[] = [];
  const sessionDirs = readdirSync(projectsDir).flatMap((project) => {
    const dir = path.join(projectsDir, project);
    try {
      return readdirSync(dir).map((s) => path.join(dir, s, "subagents"));
    } catch {
      return [];
    }
  });
  for (const subDir of sessionDirs) {
    if (!existsSync(subDir)) continue;
    for (const f of readdirSync(subDir)) {
      if (!f.endsWith(".meta.json")) continue;
      try {
        if (!TRADER_AGENT.test(JSON.parse(readFileSync(path.join(subDir, f), "utf8")).agentType ?? "")) continue;
      } catch {
        continue;
      }
      const file = path.join(subDir, f.replace(".meta.json", ".jsonl"));
      if (!existsSync(file)) continue;
      const st = statSync(file);
      if (st.mtimeMs < sinceMs) continue; // sin actividad desde el inicio de la misión
      const cached = fileCache.get(file);
      if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
        events.push(...cached.events);
        continue;
      }
      const parsed = parseTranscript(file);
      fileCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, events: parsed });
      events.push(...parsed);
    }
  }
  return events;
}

const JOURNAL_KIND: Record<string, EventKind> = {
  swap: "trade",
  cex_order: "trade",
  transfer: "trade",
  order_placed: "order",
  order_cancelled: "order",
  order_expired: "order",
  order_failed: "error",
  rejected: "error",
  hypothetical: "hypothetical",
  mission: "mission",
};

function dbEvents(): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const a of db.prepare("SELECT id, ts, kind, title, body FROM activity").all() as any[]) {
    events.push({ id: `a${a.id}`, ts: a.ts, kind: a.kind, title: a.title, body: a.body ?? undefined });
  }
  for (const j of db.prepare("SELECT id, ts, kind, summary, reasoning, details FROM journal").all() as any[]) {
    events.push({
      id: `j${j.id}`,
      ts: j.ts,
      kind: JOURNAL_KIND[j.kind] ?? "tool",
      title: j.summary,
      note: j.reasoning ?? undefined,
      body: j.details ? JSON.stringify(JSON.parse(j.details), null, 2) : undefined,
    });
  }
  for (const l of db.prepare("SELECT id, created_at, mission_id, text FROM lessons").all() as any[]) {
    events.push({ id: `l${l.id}`, ts: l.created_at, kind: "lesson", title: l.text, body: l.mission_id ? `Lección #${l.id}, de la misión #${l.mission_id}` : undefined });
  }
  for (const n of db.prepare("SELECT id, ts, text FROM notes").all() as any[]) {
    events.push({ id: `n${n.id}`, ts: n.ts, kind: "note", title: n.text });
  }
  return events;
}

/** Eventos desde `since` (ISO), ordenados del más antiguo al más reciente. */
export function timeline(since: string): TimelineEvent[] {
  return [...transcriptEvents(since), ...dbEvents()]
    .filter((e) => e.ts && e.ts >= since)
    .sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id));
}
