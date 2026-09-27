import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export type ToolOutput = string | Anthropic.Beta.BetaToolResultBlockParam["content"];

export interface ToolDef<S extends z.ZodObject> {
  name: string;
  description: string;
  schema: S;
  run: (input: z.infer<S>, ctx: { sessionId: number }) => Promise<ToolOutput>;
}

export function tool<S extends z.ZodObject>(def: ToolDef<S>) {
  return def;
}

export const json = (value: unknown) => JSON.stringify(value, null, 2);
