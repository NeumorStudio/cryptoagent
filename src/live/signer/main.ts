// Punto de entrada del firmante (dist/signer.mjs en el plugin; `npm run signer` en desarrollo).
import { runSigner } from "./server.js";

await runSigner();
