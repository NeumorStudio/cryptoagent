import { db, now } from "../db.js";
import { getBriefing, markBriefingSeen, recall } from "./memory.js";
import { getMission, missionStatus } from "./mission.js";
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

  const memoryLines: string[] = [];
  {
    const briefing = getBriefing(missionId);
    if (briefing) {
      memoryLines.push("Briefing del revisor para esta misión (lo prepara otro agente a partir de tu memoria):", briefing.text, "");
      markBriefingSeen(missionId);
    }
    const mem = recall(missionId, 6);
    const clip = (t: string, n = 300) => (t.length > n ? t.slice(0, n) + "…" : t);
    memoryLines.push(
      mem.missionHistory.length || mem.totalBeliefs || mem.howtos.length
        ? "Tu memoria, resumida y ordenada por parecido con esta misión (recall_memory tiene el detalle completo):\n" +
            JSON.stringify(
              {
                missionHistory: mem.missionHistory,
                howtos: mem.howtos.map((h) => ({ id: h.id, scope: h.scope, topic: h.topic, title: h.title })),
                beliefs: mem.beliefs.map((b) => ({ id: b.id, statement: clip(b.statement), appliesTo: b.appliesTo, evidence: b.evidence.verdict })),
                totalBeliefs: mem.totalBeliefs,
              },
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
