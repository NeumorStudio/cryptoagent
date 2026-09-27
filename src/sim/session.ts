import { db, now } from "../db.js";
import { missionHistory, missionStatus } from "./mission.js";
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
  const history = missionHistory();
  const lessons = db.prepare("SELECT id, mission_id, text FROM lessons ORDER BY id").all() as Array<{ id: number; mission_id: number | null; text: string }>;
  const unreviewed = history.filter((m) => m.lessonsWritten === 0 && m.outcome !== "cancelada");
  const missionStart = (db.prepare("SELECT created_at FROM missions ORDER BY id DESC LIMIT 1").get() as { created_at: string } | undefined)?.created_at ?? "1970";
  const recent = db.prepare("SELECT ts, kind, summary FROM journal WHERE ts >= ? ORDER BY id DESC LIMIT 15").all(missionStart) as Array<{ ts: string; kind: string; summary: string }>;

  return [
    `Sesión #${sessionId}. Fecha y hora actual: ${now()}.`,
    "",
    "Misión:",
    JSON.stringify(await missionStatus(), null, 2),
    "",
    history.length
      ? "Historial de misiones terminadas (calculado por el simulador):\n" + JSON.stringify(history, null, 2)
      : "Es tu primera misión: no hay historial.",
    "",
    lessons.length
      ? "Tu memoria (lecciones de misiones anteriores):\n" + lessons.map((l) => `- #${l.id} (misión #${l.mission_id ?? "?"}) ${l.text}`).join("\n")
      : "Todavía no tienes lecciones guardadas.",
    ...(unreviewed.length
      ? ["", `Misiones terminadas sin lecciones: ${unreviewed.map((m) => `#${m.missionId}`).join(", ")}. Puedes revisar su diario con journal_history(mission_id) y guardar lo aprendido con write_lesson.`]
      : []),
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
