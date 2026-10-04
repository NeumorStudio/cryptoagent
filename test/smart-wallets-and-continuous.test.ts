import assert from "node:assert/strict";
import { test } from "node:test";
import { db } from "../src/db.js";
import { createMission, getMission, missionStatus } from "../src/sim/mission.js";
import { treasuryStatus } from "../src/sim/portfolio.js";
import {
  addSmartWallet,
  listSmartWallets,
  removeSmartWallet,
  discoverSmartBuyers,
  scanSmartActivity,
} from "../src/market/smart-wallets.js";

test("migración 20: tabla smart_wallets y columna continuous en missions", () => {
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='smart_wallets'").get() as { name?: string } | undefined;
  assert.equal(tableCheck?.name, "smart_wallets");

  const colCheck = db.prepare("PRAGMA table_info(missions)").all() as Array<{ name: string }>;
  assert.ok(colCheck.some((c) => c.name === "continuous"), "falta columna continuous en missions");
});

test("smart_wallets: añadir, listar y retirar billeteras", () => {
  const testAddr = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
  addSmartWallet({
    address: testAddr,
    label: "SniperPro",
    notes: "Especialista en pump.fun curve",
    winRate: 72.5,
    avgTradeUsd: 45,
  });

  const list = listSmartWallets();
  const found = list.find((w) => w.address === testAddr);
  assert.ok(found, "no se encontró la wallet añadida");
  assert.equal(found?.label, "SniperPro");
  assert.equal(found?.winRate, 72.5);

  const removed = removeSmartWallet(testAddr);
  assert.ok(removed, "debería haber retirado la wallet");

  const listAfter = listSmartWallets();
  assert.ok(!listAfter.some((w) => w.address === testAddr), "la wallet retirada no debe figurar como activa");
});

test("misión continua: se crea sin plazo fijo y no expira por tiempo", async () => {
  const m = await createMission(45, null, 0, "Prueba de modo continuo", undefined, { continuous: true });
  assert.equal(m.continuous, 1);
  assert.equal(m.open_target, 1);

  const status = (await missionStatus(m.id)) as Record<string, any>;
  assert.ok(status.active);
  assert.equal(status.continuous, true);
  assert.equal(status.timeLeft, "indefinido (modo continuo)");
  assert.equal(status.secondsLeft, null);
  assert.ok(status.goal?.includes("MODO CONTINUO"));
});

test("treasuryStatus: desglosa capital base, saldo en estables y colchón de beneficios", async () => {
  const m = await createMission(50, null, 0, "Test tesorería", undefined, { continuous: true });
  const t = await treasuryStatus(m.id);

  assert.equal(t.initialCapitalUsd, 50);
  assert.ok(t.stableBalanceUsd > 0, "debe tener saldo en estables iniciales");
  assert.equal(t.tradingRiskCapUsd, 50);
  assert.equal(t.isContinuous, true);
  assert.ok(typeof t.guidance === "string");
});

test("scanSmartActivity: responde correctamente con resumen de actividad", async () => {
  const res = await scanSmartActivity("solana");
  assert.ok(typeof res.trackedCount === "number");
  assert.ok(Array.isArray(res.alerts));
  assert.ok(Array.isArray(res.activeWallets));
  assert.ok(typeof res.summary === "string");
});
