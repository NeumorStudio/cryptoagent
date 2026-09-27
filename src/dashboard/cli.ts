// Arranca el panel a mano:  npm run dashboard
import { startDashboard } from "./server.js";

const { url, alreadyRunning } = await startDashboard({ log: console.error });
console.log(alreadyRunning ? `El panel ya estaba en marcha en ${url}` : `Panel en ${url}  (Ctrl+C para salir)`);
if (alreadyRunning) process.exit(0);
