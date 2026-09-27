// Vigilante de órdenes condicionales y de la misión. Déjalo corriendo para que las órdenes
// se ejecuten y la misión se cierre a tiempo aunque el agente no esté activo:  npm run watcher
import { config } from "./config.js";
import { checkMission } from "./sim/mission.js";
import { checkOrders } from "./sim/orders.js";

const time = () => new Date().toLocaleTimeString();

async function tick() {
  try {
    for (const line of [...(await checkOrders()), ...(await checkMission())]) console.log(`[${time()}] ${line}`);
  } catch (err) {
    console.error(`[${time()}] Error revisando órdenes: ${(err as Error).message}`);
  }
}

console.log(`Vigilando órdenes y misión cada ${config.watchIntervalSeconds} s (Ctrl+C para salir)`);
await tick();
setInterval(tick, config.watchIntervalSeconds * 1000);
