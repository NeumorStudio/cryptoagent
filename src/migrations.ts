// Migraciones versionadas de la base de datos. El número de la última aplicada se guarda en
// PRAGMA user_version (no en `meta`, que `npm run reset` vacía).
//
// Varios procesos (un servidor MCP por sesión de Claude Code, el vigilante, los informes) pueden
// arrancar a la vez: cada paso se aplica dentro de BEGIN IMMEDIATE y vuelve a comprobar la versión,
// así que solo uno lo ejecuta. Antes de migrar una base de datos con datos se hace una copia.
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { fingerprint, lessonRefs } from "./sim/text.js";

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
  {
    version: 2,
    description: "Memoria de tres tipos (howtos, creencias, retrospectivas) escrita por el agente revisor",
    up: memoryV2,
  },
  {
    version: 3,
    description: "Cadenas EVM (Base, BNB Chain): datos de tokens, approvals, y reparto y referencia de cada misión",
    up: (db) =>
      db.exec(`
        -- Símbolo y decimales de los tokens EVM (no cambian: se leen una vez por RPC).
        CREATE TABLE token_meta (chain TEXT NOT NULL, address TEXT NOT NULL, symbol TEXT NOT NULL, decimals INTEGER NOT NULL, PRIMARY KEY (chain, address));
        -- Tokens que el monedero EVM de cada misión ya ha aprobado para vender (la primera venta cuesta un approve).
        CREATE TABLE evm_approvals (mission_id INTEGER NOT NULL, chain TEXT NOT NULL, token TEXT NOT NULL, approved_at TEXT NOT NULL, PRIMARY KEY (mission_id, chain, token));
        -- Reparto inicial del capital por cadena o exchange (JSON de porcentajes) y cartera inicial para la referencia "sin operar".
        ALTER TABLE missions ADD COLUMN allocation TEXT;
        ALTER TABLE missions ADD COLUMN benchmark TEXT;
      `),
  },
  {
    version: 4,
    description: "Transferencias con tiempo de llegada: depósitos y retiradas de Binance y puentes entre cadenas",
    up: (db) =>
      db.exec(`
        -- El dinero sale al momento y llega en arrives_at. status: 'pending' | 'settling' | 'settled'.
        -- kind: 'cex_deposit' | 'cex_withdraw' | 'bridge'. carry: coste de la posición que viaja con el activo.
        CREATE TABLE transfers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mission_id INTEGER NOT NULL,
          session_id INTEGER,
          created_at TEXT NOT NULL,
          arrives_at TEXT NOT NULL,
          settled_at TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          kind TEXT NOT NULL,
          from_venue TEXT NOT NULL,
          to_venue TEXT NOT NULL,
          provider TEXT NOT NULL,
          asset_out TEXT NOT NULL,
          symbol_out TEXT NOT NULL,
          amount_out REAL NOT NULL,
          asset_in TEXT NOT NULL,
          symbol_in TEXT NOT NULL,
          decimals_in INTEGER NOT NULL,
          amount_in REAL NOT NULL,
          value_usd REAL,
          costs TEXT NOT NULL,
          carry TEXT
        );
        CREATE INDEX transfers_pending ON transfers (status, arrives_at);
      `),
  },
  {
    version: 5,
    description: "El reloj de la misión arranca cuando el agente empieza a trabajar",
    // Las misiones que ya existían cuentan como empezadas al crearse.
    up: (db) => db.exec("ALTER TABLE missions ADD COLUMN started_at TEXT; UPDATE missions SET started_at = created_at;"),
  },
];

/**
 * Memoria de tres tipos. La escribe el agente revisor, no el que opera:
 * - howtos: conocimiento procedimental (cómo se hace algo, qué falla y cómo evitarlo).
 * - beliefs: creencias sobre el mercado; su evidencia la calcula el simulador con las posiciones reales.
 * - mission_reviews: retrospectiva de cada misión (lo episódico, junto con el diario).
 * Las lecciones antiguas pasan a ser creencias con el mismo id, para que "Lección 5" siga apuntando a lo mismo.
 */
function memoryV2(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE howtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      scope TEXT NOT NULL,            -- cadena o exchange al que se aplica, o 'any'
      topic TEXT NOT NULL,
      title TEXT NOT NULL,
      steps TEXT NOT NULL,
      source_mission_id INTEGER,
      fingerprint TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'obsolete'
      superseded_by INTEGER,
      from_belief_id INTEGER
    );
    CREATE TABLE beliefs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source_mission_id INTEGER,
      statement TEXT NOT NULL,
      applies_to TEXT NOT NULL,
      expectation TEXT,               -- con condición: 'positive' (tiende a ganar) | 'negative' (tiende a perder)
      condition TEXT,                 -- JSON: {"all":[{"f":"ageMinutes","op":"<","v":30}]}
      fingerprint TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'retired' | 'converted'
      status_reason TEXT,
      origin TEXT NOT NULL DEFAULT 'reviewer', -- 'reviewer' | 'migrated'
      legacy_evidence TEXT
    );
    CREATE TABLE mission_reviews (
      mission_id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'reviewer', -- 'reviewer' | 'legacy'
      what_was_tried TEXT NOT NULL,
      what_happened TEXT NOT NULL,
      surprises TEXT,
      next_time TEXT NOT NULL
    );
    -- Revisiones a mitad de misión: marcan hasta dónde ha revisado el revisor.
    CREATE TABLE review_checkpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      mission_id INTEGER NOT NULL,
      summary TEXT NOT NULL
    );
    -- Lo que el revisor quiere que el agente tenga presente en una misión. seen_at: cuándo lo recibió el agente.
    CREATE TABLE briefings (
      mission_id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      text TEXT NOT NULL,
      seen_at TEXT
    );
    -- Observaciones del agente que opera para el revisor, que decide si pasan a la memoria.
    CREATE TABLE observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      mission_id INTEGER,
      session_id INTEGER,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'used' | 'dismissed'
      resolved_at TEXT,
      resolution TEXT
    );
    -- Errores de las herramientas, capturados por el simulador.
    CREATE TABLE tool_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      mission_id INTEGER,
      session_id INTEGER,
      tool TEXT NOT NULL,
      venue TEXT,
      error_class TEXT NOT NULL,
      message TEXT NOT NULL,
      input TEXT,
      howto_id INTEGER
    );
    CREATE INDEX tool_errors_class ON tool_errors (error_class, ts);
    -- Qué APIs responden: lo mide http_get en cada llamada del agente.
    CREATE TABLE api_observations (
      host TEXT NOT NULL,
      path TEXT NOT NULL,
      ok INTEGER NOT NULL DEFAULT 0,
      fail INTEGER NOT NULL DEFAULT 0,
      last_status INTEGER,
      last_ok_at TEXT,
      last_fail_at TEXT,
      PRIMARY KEY (host, path)
    );
    -- Capacidades que el agente echa en falta (una cuenta, una herramienta, otro mercado…), para que el
    -- usuario decida si se las da. Las peticiones parecidas se agrupan y se cuentan.
    CREATE TABLE capability_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source TEXT NOT NULL,             -- 'trader' | 'reviewer'
      category TEXT NOT NULL,
      capability TEXT NOT NULL,
      why TEXT NOT NULL,
      plan TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      times_requested INTEGER NOT NULL DEFAULT 1,
      missions TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'accepted' | 'rejected' | 'done'
      response TEXT
    );
    ALTER TABLE positions ADD COLUMN beliefs_applied TEXT;
  `);

  // Lecciones → creencias con el mismo id.
  const lessons = db.prepare("SELECT id, created_at, mission_id, text, applies_to, evidence, confidence FROM lessons ORDER BY id").all() as Array<{
    id: number;
    created_at: string;
    mission_id: number | null;
    text: string;
    applies_to: string | null;
    evidence: string | null;
    confidence: string | null;
  }>;
  const insertBelief = db.prepare(
    `INSERT INTO beliefs (id, created_at, updated_at, source_mission_id, statement, applies_to, fingerprint, origin, legacy_evidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'migrated', ?)`,
  );
  for (const l of lessons) {
    const evidence = [l.evidence, l.confidence ? `(confianza que declaró el agente: ${l.confidence})` : null].filter(Boolean).join(" ");
    insertBelief.run(l.id, l.created_at, l.created_at, l.mission_id, l.text, l.applies_to ?? "(sin especificar)", fingerprint(l.text), evidence || null);
  }

  // Misiones ya revisadas con el sistema anterior: retrospectiva de origen 'legacy'.
  const reviewed = db.prepare("SELECT id, reviewed_at FROM missions WHERE reviewed_at IS NOT NULL").all() as Array<{ id: number; reviewed_at: string }>;
  const insertReview = db.prepare(
    "INSERT INTO mission_reviews (mission_id, created_at, origin, what_was_tried, what_happened, next_time) VALUES (?, ?, 'legacy', ?, ?, ?)",
  );
  for (const m of reviewed) {
    const ids = lessons.filter((l) => l.mission_id === m.id).map((l) => `#${l.id}`);
    const note = ids.length ? `Revisada antes de existir el revisor: lo aprendido está en las creencias ${ids.join(", ")}.` : "Revisada antes de existir el revisor, sin lecciones.";
    insertReview.run(m.id, m.reviewed_at, note, note, ids.length ? `Ver las creencias ${ids.join(", ")}.` : "-");
  }

  // Referencias a lecciones en las tesis ("Lección 5", "Lecciones 5 y 6") → creencias aplicadas.
  const known = new Set(lessons.map((l) => l.id));
  const positions = db.prepare("SELECT id, lessons_applied FROM positions WHERE lessons_applied IS NOT NULL").all() as Array<{ id: number; lessons_applied: string }>;
  const setApplied = db.prepare("UPDATE positions SET beliefs_applied = ? WHERE id = ?");
  for (const p of positions) {
    const ids = lessonRefs(p.lessons_applied).filter((id) => known.has(id));
    if (ids.length) setApplied.run(JSON.stringify(ids), p.id);
  }
}

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
