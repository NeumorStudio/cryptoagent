// Claves de APIs de terceros (gratuitas): en ~/.cryptoagent/keys.json (fuera de los repositorios), o en una variable de
// entorno <NOMBRE>_API_KEY, que manda. Nunca se escriben en el diario, el panel ni las respuestas de las herramientas.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolveDataDir } from "./paths.js";

let cache: Record<string, string> | null = null;

export function apiKey(name: "jupiter"): string | undefined {
  const fromEnv = process.env[`${name.toUpperCase()}_API_KEY`];
  if (fromEnv) return fromEnv;
  if (!cache) {
    const file = path.join(resolveDataDir(), "keys.json");
    try {
      cache = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, string>) : {};
    } catch {
      cache = {};
    }
  }
  return cache[name] || undefined;
}
