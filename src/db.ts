import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(config.dataDir, "sim.db"));

// Varios procesos (servidor MCP, vigilante de órdenes, informes) comparten la base de datos.
db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 10000;");

db.exec(`
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  -- venue: 'solana' (asset = mint) | 'binance' (asset = ticker, p.ej. 'USDT')
  CREATE TABLE IF NOT EXISTS holdings (
    venue TEXT NOT NULL,
    asset TEXT NOT NULL,
    symbol TEXT NOT NULL,
    decimals INTEGER NOT NULL,
    amount REAL NOT NULL,
    PRIMARY KEY (venue, asset)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    final_text TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0
  );
  -- kind: 'swap' | 'cex_order' | 'transfer' | 'hypothetical' | 'rejected'
  CREATE TABLE IF NOT EXISTS journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    session_id INTEGER,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    reasoning TEXT,
    details TEXT
  );
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    session_id INTEGER,
    text TEXT NOT NULL
  );
  -- Órdenes condicionales: cuando el precio cruza el disparador se ejecuta 'action' a mercado.
  -- status: 'open' | 'executing' | 'filled' | 'failed' | 'cancelled' | 'expired'
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    session_id INTEGER,
    venue TEXT NOT NULL,
    trigger_asset TEXT NOT NULL,
    trigger_label TEXT NOT NULL,
    condition TEXT NOT NULL,
    trigger_price REAL NOT NULL,
    action TEXT NOT NULL,
    reasoning TEXT,
    expires_at TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    closed_at TEXT,
    result TEXT
  );
  -- status: 'active' | 'succeeded' (objetivo alcanzado) | 'expired' (se acabó el tiempo) | 'cancelled'
  CREATE TABLE IF NOT EXISTS missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    initial_usd REAL NOT NULL,
    target_usd REAL NOT NULL,
    deadline TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    ended_at TEXT,
    final_usd REAL
  );
  -- Actividad del agente para el panel: registro de trabajo ('thought', vía log_progress) y, en el runner por API,
  -- también sus textos, razonamiento resumido y llamadas a herramientas.
  CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    session_id INTEGER,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT
  );
  -- Memoria a largo plazo del agente: lecciones que sobreviven entre misiones.
  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    mission_id INTEGER,
    text TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS snapshots (
    ts TEXT NOT NULL,
    total_usd REAL NOT NULL,
    benchmark_usd REAL NOT NULL,
    details TEXT
  );
`);

db.exec(`
  -- Posiciones: cada token comprado en una misión, con los datos del token al entrar,
  -- la investigación hecha antes y el resultado real al salir. Lo calcula el simulador.
  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id INTEGER,
    venue TEXT NOT NULL,
    asset TEXT NOT NULL,
    symbol TEXT NOT NULL,
    opened_at TEXT NOT NULL,
    closed_at TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    qty_open REAL NOT NULL,
    cost_open_usd REAL NOT NULL,
    realized_cost_usd REAL NOT NULL DEFAULT 0,
    realized_proceeds_usd REAL NOT NULL DEFAULT 0,
    entry_features TEXT,
    research TEXT,
    thesis TEXT,
    lessons_applied TEXT,
    exit_reason TEXT
  );
  -- Llamadas a herramientas de investigación, para saber cuánto investigó antes de cada operación.
  CREATE TABLE IF NOT EXISTS research_log (
    ts TEXT NOT NULL,
    mission_id INTEGER,
    tool TEXT NOT NULL,
    target TEXT
  );
`);

// Migraciones de columnas añadidas después de crear la tabla.
function addColumns(table: string, columns: Record<string, string>) {
  const existing = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);
  for (const [name, type] of Object.entries(columns)) {
    if (!existing.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
}
addColumns("missions", { instructions: "TEXT", reviewed_at: "TEXT" });
addColumns("lessons", { applies_to: "TEXT", evidence: "TEXT", confidence: "TEXT" });

export const now = () => new Date().toISOString();

export function getMeta(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setMeta(key: string, value: string) {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function logActivity(entry: { sessionId: number | null; kind: string; title: string; body?: string }) {
  db.prepare("INSERT INTO activity (ts, session_id, kind, title, body) VALUES (?, ?, ?, ?, ?)").run(
    now(),
    entry.sessionId,
    entry.kind,
    entry.title,
    entry.body ?? null,
  );
}

export function logJournal(entry: {
  sessionId: number | null;
  kind: string;
  summary: string;
  reasoning?: string;
  details?: unknown;
}) {
  db.prepare("INSERT INTO journal (ts, session_id, kind, summary, reasoning, details) VALUES (?, ?, ?, ?, ?, ?)").run(
    now(),
    entry.sessionId,
    entry.kind,
    entry.summary,
    entry.reasoning ?? null,
    entry.details === undefined ? null : JSON.stringify(entry.details),
  );
}
