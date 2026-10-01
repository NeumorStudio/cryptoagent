// El firmante sobrevive a las actualizaciones del plugin: se detecta si el que está en marcha es de otra versión.
import assert from "node:assert/strict";
import { test } from "node:test";
import { signerOutdated } from "../src/live/client.js";
import { codeBuild } from "../src/live/paths.js";
import { asset } from "../src/paths.js";

test("un firmante con otra huella de código está desactualizado; con la misma, no", () => {
  const current = codeBuild(asset("signer.mjs", "src/live/signer/main.ts"));
  assert.ok(current);
  const info = { port: 1, token: "t", pid: 1, startedAt: "" };
  assert.equal(signerOutdated({ ...info, build: current }), false);
  assert.equal(signerOutdated({ ...info, build: "0123456789abcdef" }), true);
  // Uno anterior a esta versión no dice su huella: también está desactualizado.
  assert.equal(signerOutdated(info), true);
});
