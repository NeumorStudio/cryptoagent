import assert from "node:assert/strict";
import { test } from "node:test";
import { roundDownToStep, walkBook } from "../src/market/binance.js";
import { fromBaseUnits, toBaseUnits } from "../src/market/jupiter.js";

type Levels = Parameters<typeof walkBook>[0];

test("walkBook: compra recorriendo varios niveles", () => {
  const asks = [
    [100, 1],
    [101, 2],
  ] as Levels;
  const fill = walkBook(asks, "BUY", 150);
  assert.equal(fill.quoteQty, 150);
  assert.ok(Math.abs(fill.baseQty - (1 + 50 / 101)) < 1e-9);
  assert.equal(fill.levelsConsumed, 2);
  assert.ok(fill.avgPrice > 100 && fill.avgPrice < 101);
});

test("walkBook: venta y liquidez insuficiente", () => {
  const bids = [
    [100, 1],
    [99, 1],
  ] as Levels;
  const fill = walkBook(bids, "SELL", 1.5);
  assert.equal(fill.baseQty, 1.5);
  assert.equal(fill.quoteQty, 100 + 49.5);
  assert.throws(() => walkBook([[100, 1]] as Levels, "SELL", 2), /liquidez/);
});

test("roundDownToStep redondea hacia abajo", () => {
  assert.equal(roundDownToStep(1.23456, 0.001), 1.234);
});

test("unidades base sin perder precisión", () => {
  assert.equal(toBaseUnits(1.5, 6), 1_500_000n);
  assert.equal(toBaseUnits(0.000000001, 9), 1n);
  assert.equal(fromBaseUnits("2500000", 6), 2.5);
});
