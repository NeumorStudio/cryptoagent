// Migraciones versionadas de la base de datos. El número de la última aplicada se guarda en
// PRAGMA user_version (no en `meta`, que `npm run reset` vacía).
//
// Varios procesos (un servidor MCP por sesión de Claude Code, el vigilante, los informes) pueden
// arrancar a la vez: cada paso se aplica dentro de BEGIN IMMEDIATE y vuelve a comprobar la versión,
// así que solo uno lo ejecuta. Antes de migrar una base de datos con datos se hace una copia.
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

export interface Migration {
  version: number;
  description: string;
  up: (db: DatabaseSync) => void;
}

// El esquema base (tablas y columnas hasta v0.7.0) lo crea db.ts de forma idempotente.
// A partir de aquí, cada cambio de esquema es un paso nuevo al final de la lista.
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: "Cupos de peticiones por servicio (APIs con límite por ventana de tiempo)",
    up: (db) => db.exec("CREATE TABLE IF NOT EXISTS http_budget (host TEXT PRIMARY KEY, window_start INTEGER NOT NULL, used INTEGER NOT NULL)"),
  },
];

const MAX_BACKUPS = 10;

export const schemaVersion = (db: DatabaseSync) => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;

export const latestVersion = () => MIGRATIONS.reduce((v, m) => Math.max(v, m.version), 0);

function hasUserData(db: DatabaseSync) {
  return Boolean(db.prepare("SELECT 1 FROM missions LIMIT 1").get());
}

/** Copia de la base de datos antes de migrarla, en <dataDir>/backups. Conserva las últimas copias. */
function backup(db: DatabaseSync, dataDir: string, from: number) {
  const dir = path.join(dataDir, "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `sim-v${from}-${stamp}-${process.pid}.db`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const old = readdirSync(dir).filter((f) => f.startsWith("sim-v") && f.endsWith(".db")).sort();
  for (const f of old.slice(0, Math.max(0, old.length - MAX_BACKUPS))) rmSync(path.join(dir, f), { force: true });
  return file;
}

/** Aplica las migraciones pendientes. Devuelve las versiones aplicadas por este proceso. */
export function runMigrations(db: DatabaseSync, dataDir: string, migrations: Migration[] = MIGRATIONS): number[] {
  const pending = migrations.filter((m) => m.version > schemaVersion(db)).sort((a, b) => a.version - b.version);
  if (!pending.length) return [];
  if (hasUserData(db)) backup(db, dataDir, schemaVersion(db));

  const applied: number[] = [];
  for (const m of pending) {
    db.exec("BEGIN IMMEDIATE");
    try {
      // Otro proceso puede haberla aplicado mientras esperábamos el bloqueo.
      if (schemaVersion(db) >= m.version) {
        db.exec("COMMIT");
        continue;
      }
      m.up(db);
      db.exec(`PRAGMA user_version = ${m.version}`);
      db.exec("COMMIT");
      applied.push(m.version);
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(`Falló la migración ${m.version} (${m.description}): ${(err as Error).message}`);
    }
  }
  return applied;
}
