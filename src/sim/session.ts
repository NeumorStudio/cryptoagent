import { db, now } from "../db.js";
import { recall } from "./memory.js";
import { missionStatus } from "./mission.js";
import { listOrders } from "./orders.js";
import { valuation } from "./portfolio.js";

export function startSession(): number {
  return Number(db.prepare("INSERT INTO sessions (started_at) VALUES (?)").run(now()).lastInsertRowid);
}

/** Lo que el agente ve al empezar cada sesión: cartera, sus notas y el diario reciente. */
export async function sessionBriefing(sessionId: number): Promise<string> {
  const portfolio = await valuation(true);
  const notes = db.prepare("SELECT id, ts, text FROM notes ORDER BY id").all() as Array<{ id: number; ts: string; text: string }>;
  const openOrders = listOrders("open");
  const mem = recall(8);
  const missionStart = (db.prepare("SELECT created_at FROM missions ORDER BY id DESC LIMIT 1").get() as { created_at: string } | undefined)?.created_at ?? "1970";
  const recent = db.prepare("SELECT ts, kind, summary FROM journal WHERE ts >= ? ORDER BY id DESC LIMIT 15").all(missionStart) as Array<{ ts: string; kind: string; summary: string }>;

  return [
    `Sesión #${sessionId}. Fecha y hora actual: ${now()}.`,
    "",
    "Misión:",
    JSON.stringify(await missionStatus(), null, 2),
    "",
    ...(mem.pendingReview.length
      ? [
          `PENDIENTE: antes de operar tienes que revisar ${mem.pendingReview.length > 1 ? "las misiones" : "la misión"} #${mem.pendingReview.join(", #")} ` +
            "(trade_history y journal_history con su mission_id) y guardar lo aprendido con write_lesson, o mark_mission_reviewed si no aporta nada.",
          "",
        ]
      : []),
    mem.missionHistory.length
      ? "Tu memoria, ordenada por parecido con esta misión (recall_lessons tiene el detalle completo):\n" +
        JSON.stringify(
          {
            missionHistory: mem.missionHistory.slice(0, 6),
            lessons: mem.lessons,
            totalLessons: mem.totalLessons,
            tradeStats: mem.tradeStats,
          },
          null,
          2,
        )
      : "Es tu primera misión: todavía no tienes memoria.",
    "",
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

export async function endSession(sessionId: number, finalText: string, tokens?: { input: number; output: number }) {
  const end = await valuation(true);
  db.prepare("UPDATE sessions SET ended_at = ?, final_text = ?, input_tokens = ?, output_tokens = ? WHERE id = ?").run(
    now(),
    finalText,
    tokens?.input ?? 0,
    tokens?.output ?? 0,
    sessionId,
  );
  return end;
}
