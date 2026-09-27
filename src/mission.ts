// Crea una misión nueva:  npm run mission -- --capital 1000 --target 1050 --hours 24
// (también --minutes). Reinicia la cartera con el capital indicado; diario y notas se conservan.
import { parseArgs } from "node:util";
import { createMission } from "./sim/mission.js";

const { values } = parseArgs({
  options: {
    capital: { type: "string" },
    target: { type: "string" },
    hours: { type: "string" },
    minutes: { type: "string" },
    instructions: { type: "string" },
  },
});

const capital = Number(values.capital);
const target = Number(values.target);
const minutes = Number(values.minutes ?? 0) + Number(values.hours ?? 0) * 60;

if (!capital || !target || !minutes) {
  console.log("Uso: npm run mission -- --capital 1000 --target 1050 --hours 24   (o --minutes 90)");
  process.exit(1);
}

const mission = await createMission(capital, target, minutes, values.instructions);
console.log(
  `Misión #${mission.id} creada: de ${capital} USD a ${target} USD (+${(((target - capital) / capital) * 100).toFixed(2)} %) ` +
    `antes de ${new Date(mission.deadline).toLocaleString()}.`,
);
console.log("Lanza el agente con /trading en Claude Code, o con `npm run agent`.");
