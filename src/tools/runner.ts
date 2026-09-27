// Herramientas del runner por API: las del simulador más el navegador propio (Playwright).
// El servidor MCP no importa este módulo, así que no depende de Playwright.
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { BROWSER_TOOLS, closeBrowser } from "./browser-tools.js";
import { runTool as runSimTool, SIM_TOOLS } from "./index.js";

const TOOLS = [...BROWSER_TOOLS, ...SIM_TOOLS];

export const toolDefinitions: Anthropic.Beta.BetaToolUnion[] = [
  { type: "web_search_20260209", name: "web_search" },
  ...TOOLS.map(
    (t): Anthropic.Beta.BetaTool => ({
      name: t.name,
      description: t.description,
      input_schema: z.toJSONSchema(t.schema, { io: "input" }) as Anthropic.Beta.BetaTool.InputSchema,
    }),
  ),
];

export const runTool = (name: string, rawInput: unknown, ctx: { sessionId: number }) => runSimTool(name, rawInput, ctx, TOOLS as never);

export const closeTools = closeBrowser;
