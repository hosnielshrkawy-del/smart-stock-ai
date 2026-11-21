import assert from "node:assert/strict";
import test from "node:test";
import { financeAmountUnits, financeUnitsToDecimal } from "./finance-money.ts";

test("parses four-decimal currency values into exact integer units", () => {
  assert.equal(financeAmountUnits("12"), 120000);
  assert.equal(financeAmountUnits("12.3"), 123000);
  assert.equal(financeAmountUnits("12.3456"), 123456);
  assert.equal(financeAmountUnits("0.0001"), 1);
  assert.equal(financeAmountUnits("01.25"), 12500);
  assert.equal(financeAmountUnits("1."), 10000);
  assert.equal(financeAmountUnits(0.1), 1000);
});

test("rejects negative, malformed, over-precision, and unsafe values", () => {
  for (const value of ["-1", "1.00001", "1e3", "", ".5", "abc", Infinity, NaN, 900719925474.0992]) {
    assert.equal(financeAmountUnits(value), null, `expected ${String(value)} to be rejected`);
  }
});

test("formats exact units without floating-point drift", () => {
  assert.equal(financeUnitsToDecimal(123456), "12.3456");
  assert.equal(financeUnitsToDecimal(1), "0.0001");
  assert.equal(financeUnitsToDecimal(0), "0.0000");
  assert.throws(() => financeUnitsToDecimal(-1), RangeError);
  assert.throws(() => financeUnitsToDecimal(1.5), RangeError);
});
