// Registro para la declaración: todas las operaciones con dinero real (swaps y puentes), con su hash,
// cantidades, valor en USD y en EUR y la comisión de red, más los resultados por posición cerrada.
// En España cada permuta entre criptomonedas es una ganancia o pérdida patrimonial. Esto es un registro
// de apoyo, no asesoramiento fiscal: el coste de las posiciones es medio, no FIFO.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { db } from "../db.js";
import { fetchJson } from "../market/http.js";

const day = (iso: string) => iso.slice(0, 10);

/** USD → EUR por día, con el par EURUSDT de Binance (cierre diario). */
async function eurRates(from: string, to: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  let start = new Date(`${day(from)}T00:00:00Z`).getTime();
  const end = new Date(`${day(to)}T23:59:59Z`).getTime();
  while (start <= end) {
    const rows = await fetchJson<Array<[number, string, string, string, string]>>(
      `https://api.binance.com/api/v3/klines?symbol=EURUSDT&interval=1d&startTime=${start}&endTime=${end}&limit=1000`,
      { ttlMs: 3_600_000 },
    ).catch(() => []);
    if (!rows.length) break;
    for (const r of rows) out.set(new Date(r[0]).toISOString().slice(0, 10), 1 / Number(r[4]));
    start = rows.at(-1)![0] + 86_400_000;
  }
  return out;
}

// CSV para Excel en español: separador ";" y coma decimal, con BOM para que abra bien las tildes.
const num = (n: number | null | undefined, d = 8) => (n === null || n === undefined || !Number.isFinite(n) ? "" : Number(n.toFixed(d)).toString().replace(".", ","));
const cell = (v: string | number | null | undefined) => {
  const s = typeof v === "number" ? num(v) : (v ?? "");
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header: string[], rows: Array<Array<string | number | null | undefined>>) =>
  "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";

export async function exportTaxes(opts: { year?: number } = {}) {
  const yearFilter = opts.year ? `AND substr(j.ts, 1, 4) = '${opts.year}'` : "";
  const ops = db
    .prepare(
      `SELECT j.ts, j.mission_id, j.kind, j.summary, j.details FROM journal j JOIN missions m ON m.id = j.mission_id
       WHERE m.mode = 'live' AND j.kind IN ('swap', 'transfer', 'transfer_arrived', 'failed_tx') ${yearFilter} ORDER BY j.id`,
    )
    .all() as Array<{ ts: string; mission_id: number; kind: string; summary: string; details: string | null }>;
  const positions = db
    .prepare(
      `SELECT p.mission_id, p.venue, p.symbol, p.asset, p.opened_at, p.closed_at, p.status, p.realized_cost_usd, p.realized_proceeds_usd
       FROM positions p JOIN missions m ON m.id = p.mission_id
       WHERE m.mode = 'live' AND p.status IN ('closed', 'partial') ${opts.year ? `AND substr(p.closed_at, 1, 4) = '${opts.year}'` : ""} ORDER BY p.closed_at`,
    )
    .all() as Array<Record<string, any>>;
  if (!ops.length && !positions.length) return { operations: 0, positions: 0, files: [] as string[], note: "No hay operaciones con dinero real" + (opts.year ? ` en ${opts.year}` : "") + "." };

  const dates = [...ops.map((o) => o.ts), ...positions.map((p) => p.closed_at as string)].filter(Boolean).sort();
  const eur = await eurRates(dates[0]!, dates.at(-1)!);
  const toEur = (usd: number | null | undefined, iso: string) => (usd === null || usd === undefined || !eur.get(day(iso)) ? null : usd * eur.get(day(iso))!);

  const opRows = ops.map((o) => {
    const d = (o.details ? JSON.parse(o.details) : {}) as Record<string, any>;
    const tipo = o.kind === "swap" ? "permuta (swap)" : o.kind === "transfer" ? "puente (salida)" : o.kind === "transfer_arrived" ? "puente (llegada)" : "transacción fallida";
    const usd = typeof d.valueUsd === "number" ? d.valueUsd : null;
    return [
      o.ts,
      o.mission_id,
      d.chain ?? "",
      tipo,
      d.soldQty ?? null,
      d.soldSymbol ?? "",
      d.receivedQty ?? null,
      d.receivedSymbol ?? "",
      usd,
      toEur(usd, o.ts),
      d.networkFee ?? "",
      d.txHash ?? "",
      d.explorer ?? "",
      o.summary,
    ];
  });
  const posRows = positions.map((p) => {
    const pnl = (p.realized_proceeds_usd ?? 0) - (p.realized_cost_usd ?? 0);
    return [
      p.closed_at,
      p.mission_id,
      p.venue,
      p.symbol,
      p.asset,
      p.opened_at,
      p.realized_cost_usd,
      p.realized_proceeds_usd,
      pnl,
      toEur(p.realized_cost_usd, p.closed_at),
      toEur(p.realized_proceeds_usd, p.closed_at),
      toEur(pnl, p.closed_at),
      p.status === "partial" ? "cierre parcial" : "cerrada",
    ];
  });

  const dir = path.join(config.dataDir, "exports");
  mkdirSync(dir, { recursive: true });
  const stamp = opts.year ? String(opts.year) : new Date().toISOString().slice(0, 10);
  const opsFile = path.join(dir, `operaciones-reales-${stamp}.csv`);
  const posFile = path.join(dir, `resultados-por-posicion-${stamp}.csv`);
  writeFileSync(
    opsFile,
    csv(
      ["fecha_utc", "mision", "cadena", "tipo", "cantidad_entregada", "activo_entregado", "cantidad_recibida", "activo_recibido", "valor_usd", "valor_eur", "comision_red", "hash", "explorador", "descripcion"],
      opRows,
    ),
  );
  writeFileSync(
    posFile,
    csv(["fecha_cierre_utc", "mision", "cadena", "token", "direccion", "fecha_apertura_utc", "coste_usd", "obtenido_usd", "resultado_usd", "coste_eur", "obtenido_eur", "resultado_eur", "estado"], posRows),
  );
  const totalPnl = posRows.reduce((s, r) => s + (Number(r[8]) || 0), 0);
  const totalPnlEur = posRows.reduce((s, r) => s + (Number(r[11]) || 0), 0);
  return {
    operations: opRows.length,
    positions: posRows.length,
    realizedUsd: Number(totalPnl.toFixed(2)),
    realizedEur: Number(totalPnlEur.toFixed(2)),
    files: [opsFile, posFile],
    note:
      "Registro de apoyo, no asesoramiento fiscal. En España cada permuta entre criptomonedas es una ganancia o pérdida patrimonial; " +
      "Hacienda exige FIFO y aquí el coste de cada posición es el medio: tu gestor puede recalcularlo con el archivo de operaciones. " +
      "El cambio a EUR es el cierre diario de EURUSDT en Binance.",
  };
}
