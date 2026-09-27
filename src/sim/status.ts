// Resumen de la misión en texto, pensado para leerse en el chat (también desde el móvil con Remote Control).
import { db } from "../db.js";
import { getActiveMission, getLastMission, getMission } from "./mission.js";
import { listOrders } from "./orders.js";
import { valuation } from "./portfolio.js";
import { listPositions } from "./positions.js";

const usd = (n: number) => `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

function timeLeft(deadline: string) {
  const min = Math.max(0, Math.round((new Date(deadline).getTime() - Date.now()) / 60_000));
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

export async function statusReport(missionId?: number): Promise<string> {
  const m = missionId !== undefined ? getMission(missionId) : (getActiveMission() ?? getLastMission());
  if (!m) return "No hay ninguna misión. Crea una con /cryptoagent:trading.";

  const v = await valuation(m.id);
  const current = m.status === "active" ? v.totalUsd : (m.final_usd ?? v.totalUsd);
  const change = ((current - m.initial_usd) / m.initial_usd) * 100;
  const progress = ((current - m.initial_usd) / (m.target_usd - m.initial_usd)) * 100;
  const statusText =
    m.status === "active"
      ? `en curso, quedan ${timeLeft(m.deadline)}`
      : m.status === "succeeded"
        ? "CONSEGUIDA"
        : m.status === "expired"
          ? "terminada sin llegar al objetivo"
          : "detenida por el usuario";

  const lines: string[] = [];
  lines.push(`Misión #${m.id}${m.lab_label ? ` (${m.lab_label}, grupo ${m.lab_group})` : ""}: ${statusText}`);
  lines.push(`Valor: ${usd(current)} (${pct(change)}) · objetivo ${usd(m.target_usd)} · progreso ${Math.round(progress)} %`);
  lines.push(m.instructions ? `Instrucciones: ${m.instructions}` : "Modo libre");

  // Posiciones abiertas con su resultado sin realizar (valor de liquidación frente a lo que costaron).
  const open = listPositions(m.id).filter((p) => p.status === "open");
  if (m.status === "active") {
    const cash = v.holdings.filter((h) => ["USDC", "USDT"].includes(h.symbol)).reduce((s, h) => s + h.usd, 0);
    lines.push("", `Posiciones (${open.length}) · liquidez ${usd(cash)}`);
    for (const p of open) {
      // Solo la parte de la posición que sigue abierta (el saldo puede incluir, p. ej., el SOL inicial para fees).
      const h = v.holdings.find((x) => x.asset === p.asset);
      const share = h && h.amount > 0 ? Math.min(1, p.qtyOpen / h.amount) : 0;
      const now = (h?.usd ?? 0) * share;
      const cost = p.openCostUsd;
      lines.push(`- ${p.symbol}: ${usd(now)} (${pct(cost ? ((now - cost) / cost) * 100 : 0)} sobre ${usd(cost)})`);
    }
    const orders = listOrders(m.id, "open");
    if (orders.length) {
      lines.push(`Órdenes abiertas: ${orders.map((o: any) => `#${o.id} si ${o.trigger_label} ${o.condition === "above" ? "≥" : "≤"} ${o.trigger_price}`).join(" · ")}`);
    }
  }

  const closed = listPositions(m.id).filter((p) => p.status === "closed");
  if (closed.length) {
    const wins = closed.filter((p) => (p.pnlUsd ?? 0) > 0).length;
    lines.push("", `Operaciones cerradas: ${closed.length} (${wins} con beneficio)`);
    for (const p of closed.slice(0, 4)) lines.push(`- ${p.symbol}: ${pct(p.pnlPct ?? 0)} en ${p.heldMinutes} min (${p.exitReason ?? "venta"})`);
  }

  // Lo último que ha hecho y anotado el agente.
  const recent = db
    .prepare("SELECT ts, kind, summary, reasoning FROM journal WHERE mission_id = ? AND kind NOT IN ('rejected') ORDER BY id DESC LIMIT 5")
    .all(m.id) as Array<{ ts: string; kind: string; summary: string; reasoning: string | null }>;
  if (recent.length) {
    lines.push("", "Últimos movimientos:");
    for (const j of recent) {
      const why = j.reasoning?.match(/^Por qué: (.*)$/m)?.[1];
      lines.push(`- ${hhmm(j.ts)} ${j.summary}${why ? ` · ${why.slice(0, 120)}` : ""}`);
    }
  }
  const notes = db
    .prepare("SELECT ts, title FROM activity WHERE kind = 'thought' AND mission_id = ? ORDER BY id DESC LIMIT 2")
    .all(m.id) as Array<{ ts: string; title: string }>;
  if (notes.length) {
    lines.push("", "Última nota del agente:");
    for (const n of notes) lines.push(`- ${hhmm(n.ts)} ${n.title.slice(0, 220)}`);
  }
  return lines.join("\n");
}
