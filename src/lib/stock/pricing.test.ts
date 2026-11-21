import test from "node:test";
import assert from "node:assert/strict";
import { majorAmountToMinor } from "./pricing.ts";

test("converts two-decimal currencies to minor units", () => {
  assert.equal(majorAmountToMinor("250.75", "EGP"), "25075");
  assert.equal(majorAmountToMinor("12", "USD"), "1200");
});

test("uses the actual currency precision", () => {
  assert.equal(majorAmountToMinor("1500", "JPY"), "1500");
  assert.equal(majorAmountToMinor("3.125", "KWD"), "3125");
});

test("rejects values with excess fractional precision", () => {
  assert.throws(() => majorAmountToMinor("1.001", "EGP"), /VALIDATION/);
  assert.throws(() => majorAmountToMinor("1.01", "JPY"), /VALIDATION/);
});

test("rejects negative, malformed, and overflowing prices", () => {
  assert.throws(() => majorAmountToMinor("-1", "EGP"), /VALIDATION/);
  assert.throws(() => majorAmountToMinor("1,000", "EGP"), /VALIDATION/);
  assert.throws(() => majorAmountToMinor("92233720368547759", "EGP"), /VALIDATION/);
});
