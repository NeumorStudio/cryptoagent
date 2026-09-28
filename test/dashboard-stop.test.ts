import assert from "node:assert/strict";
import { test } from "node:test";
import { startDashboard, stopDashboard } from "../src/dashboard/server.js";
import { installFakeMarket } from "./fake-market.js";

installFakeMarket();

test("el panel se puede cerrar: deja de escuchar en localhost", async () => {
  const port = 4391;
  const { url } = await startDashboard({ port, log: () => undefined });
  assert.equal((await fetch(`${url}/api/state`)).status, 200);
  assert.equal(await stopDashboard({ port }), true);
  await assert.rejects(fetch(`${url}/api/state`, { signal: AbortSignal.timeout(1500) }));
  assert.equal(await stopDashboard({ port }), false, "ya no había panel");
});
