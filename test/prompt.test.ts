import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { apiSystemPrompt, buildPrompt, TRADER_PROMPT_PATH } from "../src/prompt.js";

const md = `---
name: trader
---

Línea común.
- Solo en el plugin. <!-- solo-plugin -->
Otra línea.`;

test("variante del plugin: sin frontmatter ni marcas", () => {
  assert.equal(buildPrompt(md, "plugin"), "Línea común.\n- Solo en el plugin.\nOtra línea.");
});

test("variante de la API: sin las líneas exclusivas del plugin", () => {
  assert.equal(buildPrompt(md, "api"), "Línea común.\nOtra línea.");
});

test("el prompt real de la API no menciona herramientas de Claude Code", () => {
  const prompt = apiSystemPrompt();
  assert.ok(readFileSync(TRADER_PROMPT_PATH, "utf8").includes("tabs_create"));
  assert.ok(!prompt.includes("tabs_create"));
  assert.ok(!prompt.includes("ToolSearch"));
  assert.ok(!prompt.startsWith("---"));
  assert.ok(prompt.includes("mission_status"));
});
