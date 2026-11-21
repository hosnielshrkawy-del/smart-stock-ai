import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const migration = readFileSync(join(root, "migrations/0005_finance_ledger.sql"), "utf8");
const api = readFileSync(join(root, "src/lib/stock/api.ts"), "utf8");
const route = readFileSync(join(root, "src/routes/finance.tsx"), "utf8");

test("finance tables are tenant-scoped and protected by row-level security", () => {
  for (const table of ["finance_accounts", "finance_journal_entries", "finance_journal_lines"]) {
    assert.match(migration, new RegExp(`create table if not exists ${table}`));
    assert.match(migration, new RegExp(`'${table}'`));
  }
  assert.match(migration, /org_id = any\(ss_current_user_org_ids\(\)\)/);
  assert.match(migration, /force row level security/i);
});

test("posting requires at least two lines and exact debit-credit balance", () => {
  assert.match(migration, /having count\(\*\) >= 2 and sum\(l\.debit\) = sum\(l\.credit\) and sum\(l\.debit\) > 0/i);
  assert.match(migration, /SS:FINANCE_UNBALANCED_ENTRY/);
  assert.match(migration, /finance_lines_one_side_check/);
});

test("posted journal entries and their lines are immutable", () => {
  assert.match(migration, /SS:FINANCE_POSTED_IMMUTABLE/);
  assert.match(migration, /before insert or update or delete on finance_journal_entries/i);
  assert.match(migration, /before insert or update or delete on finance_journal_lines/i);
});

test("journal creation is idempotent and reversals are separate entries", () => {
  assert.match(migration, /finance_journal_idempotency_idx/);
  assert.match(migration, /finance_journal_reversal_idx/);
  assert.match(api, /idempotency_key/);
  assert.match(api, /reverseJournalEntry/);
  assert.match(api, /select org_id, \$\{reverseId\}::uuid, line_no, account_id, \$\{reason\}, credit, debit/i);
});

test("finance screens use authenticated server functions and permission gates", () => {
  assert.match(api, /getFinanceDashboard = createServerFn/);
  assert.match(api, /gate\(sql, context\.userId, data\.orgId, "finance\.view"\)/);
  assert.match(api, /gate\(sql, context\.userId, data\.orgId, "finance\.write"\)/);
  assert.match(route, /createJournalEntry/);
  assert.match(route, /reverseJournalEntry/);
  assert.match(route, /allowed\("finance\.view"\)/);
});
