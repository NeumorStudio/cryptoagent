import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export type ToolOutput = string | Anthropic.Beta.BetaToolResultBlockParam["content"];

/** Contexto de cada llamada: la sesión de trabajo y la misión sobre la que actúa (null si no hay ninguna). */
export interface ToolCtx {
  sessionId: number;
  missionId: number | null;
}

/**
 * trade: cambia la cartera (solo con misión activa y la retrospectiva hecha).
 * research: investigación. memory: memoria del agente. misc: el resto.
 */
export type ToolKind = "trade" | "research" | "memory" | "misc";

/**
 * Quién puede usarla. trader: el agente que opera. reviewer: el agente revisor, que escribe la memoria.
 * user: la sesión del usuario (comandos). both: los dos agentes. Por defecto, el trader.
 * Los dos agentes comparten el servidor MCP: el reparto se aplica en su configuración (disallowedTools),
 * y un test comprueba que coincide con este campo.
 */
export type ToolRole = "trader" | "reviewer" | "user" | "both";

export interface ToolDef<S extends z.ZodObject> {
  name: string;
  kind: ToolKind;
  role?: ToolRole;
  /**
   * Al responder, añade el briefing del revisor si ha cambiado desde la última vez que lo vio el agente.
   * Solo en herramientas del agente que opera (el revisor no debe "consumir" sus propias novedades).
   */
  deliversNews?: boolean;
  description: string;
  schema: S;
  run: (input: z.infer<S>, ctx: ToolCtx) => Promise<ToolOutput>;
  /**
   * Si la llamada cuenta como investigación previa a una operación (registro de posiciones),
   * devuelve lo investigado (token, URL…) o undefined si no hay un objetivo concreto.
   */
  researchTarget?: (input: z.infer<S>) => string | string[] | undefined;
  /** Su efecto ya queda en el diario, la bitácora o la memoria: el panel no la repite como llamada. */
  journaled?: boolean;
}

export function tool<S extends z.ZodObject>(def: ToolDef<S>) {
  return def;
}

export { json } from "./format.js";
