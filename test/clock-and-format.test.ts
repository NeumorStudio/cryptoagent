import assert from "node:assert/strict";
import { test } from "node:test";
import { createMission, getMission, missionStatus, startMissionClock } from "../src/sim/mission.js";
import { table, toText } from "../src/tools/format.js";
import { installFakeMarket } from "./fake-market.js";

installFakeMarket();

test("el reloj de la misión arranca cuando el agente empieza, y solo una vez", async () => {
  const m = await createMission(20, 40, 5, undefined, { solana: 100 });
  assert.equal(m.started_at, null);
  await new Promise((r) => setTimeout(r, 1200));
  startMissionClock(m.id);
  const started = getMission(m.id)!;
  assert.ok(started.started_at);
  const left = new Date(started.deadline).getTime() - Date.now();
  assert.ok(left > 5 * 60_000 - 1000, "los 5 minutos cuentan desde ahora, no desde que se creó");
  startMissionClock(m.id);
  assert.equal(getMission(m.id)!.deadline, started.deadline, "la segunda vez no cambia nada");
});

test("el tiempo restante se da con segundos", async () => {
  const s = (await missionStatus()) as { timeLeft: string; secondsLeft: number };
  assert.match(s.timeLeft, /^\d+ min \d+ s$/);
  assert.ok(s.secondsLeft > 290 && s.secondsLeft <= 300);
});

test("formato compacto: las listas de objetos iguales van en tabla", () => {
  const out = toText({ note: "hola", candidates: [{ a: 1, b: "x|y" }, { a: 2, c: { d: true } }] });
  assert.equal(out, 'note: hola\ncandidates:\n  [2] a|b|c\n  1|x¦y|\n  2||{"d":true}');
  assert.equal(table([{ a: "línea 1\nlínea 2" }, { a: null }]), "[2] a\nlínea 1 línea 2\n");
  // Un objeto suelto o una lista de un solo elemento no se tabulan.
  assert.equal(toText({ x: [{ a: 1 }] }), 'x: [{"a":1}]');
});
