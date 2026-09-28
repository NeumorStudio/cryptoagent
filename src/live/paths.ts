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
}
