import { db, now } from "../db.js";
import { recall } from "./memory.js";
import { exploredTokens, getMission, GROUP_RULES, missionStatus, type LabGroup } from "./mission.js";
import { listOrders } from "./orders.js";
import { valuation } from "./portfolio.js";

export function startSession(missionId: number | null): number {
  return Number(db.prepare("INSERT INTO sessions (started_at, mission_id) VALUES (?, ?)").run(now(), missionId).lastInsertRowid);
}

/** Lo que el agente ve al empezar cada sesión: su misión, su memoria, su cartera, sus notas y su diario reciente. */
export async function sessionBriefing(sessionId: number, missionId: number | null): Promise<string> {
  const header = `Sesión #${sessionId}. Fecha y hora actual: ${now()}.`;
  if (missionId === null) return [header, "", JSON.stringify(await missionStatus(), null, 2)].join("\n");

  const mission = getMission(missionId)!;
  const portfolio = await valuation(missionId, true);
  const notes = db.prepare("SELECT id, ts, text FROM notes WHERE mission_id = ? ORDER BY id").all(missionId) as Array<{ id: number; ts: string; text: string }>;
  const openOrders = listOrders(missionId, "open");
  const recent = db
    .prepare("SELECT ts, kind, summary FROM journal WHERE mission_id = ? ORDER BY id DESC LIMIT 15")
    .all(missionId) as Array<{ ts: string; kind: string; summary: string }>;

  // La memoria entre misiones es de la misión principal; en el laboratorio cada grupo tiene su papel.
  const memoryLines: string[] = [];
  if (mission.lab_run_id !== null) {
    const group = mission.lab_group as LabGroup;
    memoryLines.push(`Laboratorio: eres ${mission.lab_label} en la tanda #${mission.lab_run_id}. ${GROUP_RULES[group]}`);
    if (group === "explorador") {
      const banned = exploredTokens(mission.lab_run_id);
      memoryLines.push(
        banned.length
          ? `Tokens que no puedes comprar (ya operados en tandas anteriores): ${banned.map((t) => `${t.symbol} (${t.mint})`).join(", ")}`
          : "Todavía no hay tokens operados en tandas anteriores: no tienes ninguno prohibido.",
      );
    }
    memoryLines.push("");
  } else {
    const mem = recall(missionId, 8);
    if (mem.pendingReview.length) {
      memoryLines.push(
        `PENDIENTE: antes de operar tienes que revisar ${mem.pendingReview.length > 1 ? "las misiones" : "la misión"} #${mem.pendingReview.join(", #")} ` +
          "(trade_history y journal_history con su mission_id) y guardar lo aprendido con write_lesson, o mark_mission_reviewed si no aporta nada.",
        "",
      );
    }
    memoryLines.push(
      mem.missionHistory.length
        ? "Tu memoria, ordenada por parecido con esta misión (recall_lessons tiene el detalle completo):\n" +
            JSON.stringify(
              { missionHistory: mem.missionHistory.slice(0, 6), lessons: mem.lessons, totalLessons: mem.totalLessons, tradeStats: mem.tradeStats },
              null,
              2,
            )
        : "Es tu primera misión: todavía no tienes memoria.",
      "",
    );
  }

  return [
    header,
    "",
    "Misión:",
    JSON.stringify(await missionStatus(missionId), null, 2),
    "",
    ...memoryLines,
    "Cartera:",
    JSON.stringify(portfolio, null, 2),
    "",
    notes.length ? "Tus notas:\n" + notes.map((n) => `- (id ${n.id}, ${n.ts}) ${n.text}`).join("\n") : "No tienes notas guardadas.",
    "",
    openOrders.length ? "Órdenes condicionales abiertas:\n" + JSON.stringify(openOrders, null, 2) : "No tienes órdenes condicionales abiertas.",
    "",
    recent.length
      ? "Últimas entradas del diario:\n" + recent.reverse().map((j) => `- ${j.ts} [${j.kind}] ${j.summary}`).join("\n")
      : "El diario está vacío: es tu primera sesión.",
  ].join("\n");
}

export async function endSession(sessionId: number, missionId: number | null, finalText: string, tokens?: { input: number; output: number }) {
  const end = missionId !== null ? await valuation(missionId, true) : null;
  db.prepare("UPDATE sessions SET ended_at = ?, final_text = ?, input_tokens = ?, output_tokens = ? WHERE id = ?").run(
    now(),
    finalText,
    tokens?.input ?? 0,
    tokens?.output ?? 0,
    sessionId,
  );
  return end;
}
