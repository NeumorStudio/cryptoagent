// Cada nombre de herramienta citado entre comillas invertidas en el prompt, la guía y las skills debe
// existir: evita instrucciones que apuntan a herramientas renombradas o eliminadas.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { SIM_TOOLS } from "../src/tools/index.js";

const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

const mcpOnly = [...read("src/mcp.ts").matchAll(/registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1]!);
const TOOLS = new Set([...SIM_TOOLS.map((t) => t.name), ...mcpOnly]);

// Identificadores en snake_case que no son herramientas del simulador: parámetros, campos de APIs
// externas y herramientas de Claude Code.
const NOT_TOOLS = new Set([
  "tabs_create",
  "capital_usd",
  "target_usd",
  "duration_minutes",
  "close_positions",
  "open_in_system_browser",
  "subagent_type",
  "run_in_background",
  "created_timestamp",
  "usd_market_cap",
  "ath_market_cap",
  "reply_count",
  "real_sol_reserves",
  "last_trade_timestamp",
  "volume_usd",
  "reserve_in_usd",
  "price_change_percentage",
  "pool_created_at",
  "beliefs_applied",
  "memory_note",
  "fixes_error_ids",
  "interval_due",
  "mission_ended",
  "slippage_bps",
]);

const docs = [
  "plugin/agents/trader.md",
  "plugin/agents/reviewer.md",
  "knowledge/guia-del-terreno.md",
  ...readdirSync(path.join(root, "plugin/skills")).map((d) => `plugin/skills/${d}/SKILL.md`),
];

const TOKEN = /`([a-z*]+(?:_[a-z*]+)+)`/g;

test("las herramientas citadas en el prompt, la guía y las skills existen", () => {
  assert.ok(mcpOnly.includes("start_session"), "no se encontraron las herramientas de mcp.ts");
  const missing: string[] = [];
  let checked = 0;
  for (const doc of docs) {
    for (const [, token] of read(doc).matchAll(TOKEN)) {
      checked++;
      if (NOT_TOOLS.has(token!)) continue;
      const ok = token!.includes("*")
        ? [...TOOLS].some((t) => new RegExp(`^${token!.replace(/\*/g, "[a-z_]+")}$`).test(t))
        : TOOLS.has(token!);
      if (!ok) missing.push(`${doc}: ${token}`);
    }
  }
  assert.ok(checked > 20, `solo se encontraron ${checked} nombres: ¿ha cambiado el formato de los documentos?`);
  assert.deepEqual(missing, []);
});
