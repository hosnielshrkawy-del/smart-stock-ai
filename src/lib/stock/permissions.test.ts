import assert from "node:assert/strict";
import test from "node:test";
import { can } from "./permissions.ts";

test("finance permissions are role-scoped", () => {
  assert.equal(can("owner", [], [], "finance.write"), true);
  assert.equal(can("administrator", [], [], "finance.write"), true);
  assert.equal(can("manager", [], [], "finance.write"), true);
  assert.equal(can("accountant", [], [], "finance.write"), true);
  assert.equal(can("auditor", [], [], "finance.view"), true);
  assert.equal(can("auditor", [], [], "finance.write"), false);
  assert.equal(can("warehouse_operator", [], [], "finance.view"), false);
});

test("explicit revokes override finance role grants", () => {
  assert.equal(can("accountant", [], ["finance.write"], "finance.write"), false);
  assert.equal(can("owner", [], ["finance.write"], "finance.write"), true);
});
