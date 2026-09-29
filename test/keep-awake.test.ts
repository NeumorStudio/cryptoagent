// Con una misión en marcha el equipo no se duerme: en Windows se pide al sistema y se suelta al acabar.
import assert from "node:assert/strict";
import { test } from "node:test";
import { keepAwake } from "../src/keep-awake.js";

test("fuera de Windows no hace nada", () => {
  assert.equal(keepAwake(true, "linux"), "unsupported");
});
