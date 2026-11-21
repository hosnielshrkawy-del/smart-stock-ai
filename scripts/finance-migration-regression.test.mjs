import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("finance migration declares the composite document-lines key before its foreign key", () => {
  const sql = readFileSync(join(root, "migrations/0003_saas_foundation.sql"), "utf8");
  const indexAt = sql.indexOf("document_lines_org_id_id_uq");
  const foreignKeyAt = sql.indexOf("ledger_line_tenant_fk");
  assert.notEqual(indexAt, -1, "composite unique index must exist");
  assert.notEqual(foreignKeyAt, -1, "tenant-safe ledger foreign key must exist");
  assert.ok(indexAt < foreignKeyAt, "unique index must be created before foreign key");
});

test("finance stock-document trigger declares input VAT account UUID before use", () => {
  const sql = readFileSync(join(root, "migrations/0006_finance_operations.sql"), "utf8");
  const functionAt = sql.indexOf("create or replace function ss_finance_post_stock_document()");
  assert.notEqual(functionAt, -1, "stock-document finance trigger must exist");
  const nextFunctionAt = sql.indexOf("create or replace function", functionAt + 1);
  const section = sql.slice(functionAt, nextFunctionAt === -1 ? undefined : nextFunctionAt);
  const declareAt = section.indexOf("declare");
  const beginAt = section.indexOf("begin");
  const declaration = section.slice(declareAt, beginAt);
  assert.match(declaration, /\bv_vat_input\s+uuid\b/, "input VAT account must be declared as UUID");
  assert.match(section, /select\s+id\s+into\s+v_vat_input\s+from\s+finance_accounts/i);
  assert.match(section, /'accountId',\s*v_vat_input/);
});
