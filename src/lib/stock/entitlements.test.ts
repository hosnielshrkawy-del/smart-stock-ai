import assert from "node:assert/strict";
import test from "node:test";
import { planLimitExceeded } from "./entitlements.ts";

test("an unconfigured plan limit does not invent a cap", () => {
  assert.equal(planLimitExceeded(null, 10_000), false);
  assert.equal(planLimitExceeded(undefined, 10_000), false);
  assert.equal(planLimitExceeded("", 10_000), false);
  assert.equal(planLimitExceeded("not-a-number", 10_000), false);
});

test("an item can be added up to the configured limit but not beyond it", () => {
  assert.equal(planLimitExceeded(5, 4), false);
  assert.equal(planLimitExceeded(5, 5), true);
  assert.equal(planLimitExceeded("5", 5), true);
});

test("zero explicitly disables additional usage", () => {
  assert.equal(planLimitExceeded(0, 0), true);
});

test("requested additions are accounted for atomically", () => {
  assert.equal(planLimitExceeded(10, 7, 3), false);
  assert.equal(planLimitExceeded(10, 8, 3), true);
});

test("negative and invalid usage inputs fail open rather than corrupting usage", () => {
  assert.equal(planLimitExceeded(-1, 0), false);
  assert.equal(planLimitExceeded(5, Number.NaN), false);
  assert.equal(planLimitExceeded(5, 2, 0), false);
});
