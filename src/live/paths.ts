import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/** Carpeta de la cartera real (una por entorno, como la base de datos). */
export const liveDir = () => path.join(config.dataDir, "live");
/** Puerto, token y pid del firmante en marcha. Lo lee el servidor MCP; el modelo no tiene acceso a archivos. */
export const signerInfoFile = () => path.join(liveDir(), "signer.json");

export interface SignerInfo {
  port: number;
  token: string;
  pid: number;
  startedAt: string;
  /** Huella del código del firmante en marcha: si no coincide con la del plugin instalado, es de otra versión. */
  build?: string;
}

/** Huella de un archivo de código (el bundle del firmante). */
export function codeBuild(file: string): string | undefined {
  try {
    return createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 16);
  } catch {
    return undefined;
  }
}
