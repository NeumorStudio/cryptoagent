// Rutas que cambian entre desarrollo (este repositorio) y el plugin empaquetado (un solo archivo en dist/).
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// esbuild sustituye esta variable por "1" al empaquetar el plugin.
export const BUNDLED = process.env.CRYPTOAGENT_BUNDLED === "1";

const here = path.dirname(fileURLToPath(import.meta.url));
// En desarrollo: la raíz del repositorio. Empaquetado: la raíz del plugin (dist/..).
export const projectRoot = path.resolve(here, "..");

/** Busca un archivo junto al código empaquetado (dist/) o en su ruta del repositorio. */
export function asset(fileName: string, devPath: string): string {
  const candidates = [path.join(here, fileName), path.join(projectRoot, devPath)];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`No se encuentra ${fileName} (buscado en ${candidates.join(", ")})`);
  return found;
}

const usable = (dir: string | undefined) => (dir && !dir.includes("${") ? path.resolve(dir) : undefined);

/**
 * Dónde se guarda la base de datos. En el plugin, la carpeta persistente de Claude Code
 * (${CLAUDE_PLUGIN_DATA}), que sobrevive a las actualizaciones; si no está disponible, ~/.cryptoagent.
 */
export function resolveDataDir(): string {
  return (
    usable(process.env.DATA_DIR) ??
    usable(process.env.CLAUDE_PLUGIN_DATA) ??
    (BUNDLED ? path.join(os.homedir(), ".cryptoagent") : path.join(projectRoot, "data"))
  );
}
