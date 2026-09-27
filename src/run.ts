import { runSession } from "./agent.js";
import { config } from "./config.js";
import { checkMission, getActiveMission } from "./sim/mission.js";
import { checkOrders } from "./sim/orders.js";
import { closeTools } from "./tools/runner.js";

process.on("SIGINT", async () => {
  console.log("\nDeteniendo…");
  await closeTools();
  process.exit(0);
});

if (!getActiveMission()) {
  console.log("No hay ninguna misión activa. Crea una con:  npm run mission -- --capital 1000 --target 1050 --hours 24");
  process.exit(1);
}

const watcher = setInterval(async () => {
  try {
    for (const line of [...(await checkOrders()), ...(await checkMission())]) console.log(`[vigilante] ${line}`);
  } catch (err) {
    console.error(`[vigilante] ${(err as Error).message}`);
  }
}, config.watchIntervalSeconds * 1000);

// El agente trabaja sin parar mientras la misión siga activa: si una sesión termina
// (por límite de pasos o porque el agente respondió sin herramientas), se abre otra.
try {
  while (getActiveMission()) {
    await runSession();
    await checkMission();
    if (getActiveMission()) {
      console.log("La misión sigue activa: nueva sesión en 1 minuto (Ctrl+C para salir)");
      await new Promise((r) => setTimeout(r, 60_000));
    }
  }
  console.log("La misión ha terminado. Ejecuta `npm run report` para ver el resultado.");
} finally {
  clearInterval(watcher);
  await closeTools();
}
