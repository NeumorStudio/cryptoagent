// Informe de la misión principal (o de la indicada):  npm run report [-- <id de misión>]
import { db } from "./db.js";
import { getLastMission, getMission, missionStatus } from "./sim/mission.js";
import { valuation } from "./sim/portfolio.js";

const usd = (n: number) => `${n.toFixed(2)} USD`;
const requested = Number(process.argv[2]);
const m = Number.isInteger(requested) && requested > 0 ? getMission(requested) : getLastMission();

console.log("\n══ MISIÓN ══");
if (!m) {
  console.log("No hay ninguna misión. Crea una con: npm run mission -- --capital 1000 --target 1050 --hours 24");
  process.exit(0);
}
if (m.status === "active") console.log(await missionStatus(m.id));
else
  console.log(
    `Misión #${m.id} ` +
      `${m.status === "succeeded" ? "CONSEGUIDA" : m.status === "expired" ? "TERMINADA POR TIEMPO" : m.status.toUpperCase()}: ` +
      `${m.initial_usd} → ${m.final_usd?.toFixed(2) ?? "?"} USD (objetivo ${m.target_usd} USD, plazo ${m.deadline}, cerrada ${m.ended_at})`,
  );

const v = await valuation(m.id);
console.log("\n══ CARTERA ══");
console.log(`Inicio:        ${v.startedAt ?? "(sin inicializar)"}`);
console.log(`Capital:       ${usd(v.initialUsd)} → ${usd(v.totalUsd)}  (${v.pnlPct >= 0 ? "+" : ""}${v.pnlPct.toFixed(2)} %)`);
console.log(`Referencia:    ${usd(v.benchmarkUsd)}  (${v.benchmarkLabel})`);
console.table(v.holdings.map((h) => ({ venue: h.venue, symbol: h.symbol, cantidad: h.amount, usd: h.usd, valorado: h.valuedBy })));

const sessions = db
  .prepare("SELECT id, started_at, ended_at, input_tokens, output_tokens FROM sessions WHERE mission_id = ? ORDER BY id DESC LIMIT 10")
  .all(m.id);
console.log("\n══ SESIONES (últimas 10) ══");
console.table(sessions);

const journal = db
  .prepare("SELECT ts, kind, summary, reasoning FROM journal WHERE mission_id = ? ORDER BY id DESC LIMIT 40")
  .all(m.id) as Array<Record<string, string>>;
console.log("\n══ DIARIO (últimas 40 entradas) ══");
for (const j of journal.reverse()) {
  console.log(`\n${j.ts}  [${j.kind}]  ${j.summary}`);
  if (j.reasoning) console.log(`   ↳ ${j.reasoning}`);
}
