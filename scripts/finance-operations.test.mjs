import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const migration = readFileSync(join(root, "migrations/0006_finance_operations.sql"), "utf8");
const api = readFileSync(join(root, "src/lib/stock/api.ts"), "utf8");
const route = readFileSync(join(root, "src/routes/finance.tsx"), "utf8");

 test("phase 2 finance tables are tenant isolated", () => {
  for (const table of ["finance_documents", "finance_cash_accounts", "finance_cash_transactions", "finance_document_allocations", "finance_bank_statement_lines"]) {
    assert.match(migration, new RegExp(`create table if not exists ${table}`));
    assert.match(migration, new RegExp(`'${table}'`));
  }
  assert.match(migration, /force row level security/i);
  assert.match(migration, /ss_current_user_org_ids\(\)/);
});

test("posted sales and purchase stock documents create journal entries", () => {
  assert.match(migration, /create trigger finance_stock_document_posted_trg after update of status on documents/i);
  assert.match(migration, /v_type='dispatch' and new\.sales_order_id is not null/i);
  assert.match(migration, /v_type='receipt' and new\.purchase_order_id is not null/i);
  assert.match(migration, /'stock-document:'\|\|new\.id::text/i);
  assert.match(migration, /finance_documents\(org_id,source_document_id,document_type/);
  assert.match(migration, /مبيعات نقدية/);
  assert.match(migration, /ضريبة مدخلات/);
  assert.match(migration, /return_requires_source_invoice/);
  assert.match(migration, /receipt_requires_purchase_source/);
  assert.match(migration, /dispatch_requires_sales_source/);
  assert.match(migration, /SS:FINANCE_DOCUMENT_HAS_PAYMENTS/);
});

test("cash movements post through the balanced journal and are idempotent", () => {
  assert.match(migration, /create or replace function ss_finance_post_cash/i);
  assert.match(migration, /unique \(org_id, idempotency_key\)/i);
  assert.match(migration, /ss_finance_post_entry\(p_org,p_user,'cash_transaction'/i);
  assert.match(migration, /finance_document_allocations/);
  assert.match(migration, /SS:FINANCE_OVER_ALLOCATION/);
  assert.match(migration, /ss_finance_reverse_cash/i);
  assert.match(migration, /reversed_at is null/);
});

test("bank statement reconciliation requires matching account, amount and direction", () => {
  assert.match(migration, /ss_finance_match_bank_line/i);
  assert.match(migration, /SS:FINANCE_RECONCILIATION_MISMATCH/);
  assert.match(migration, /v_line.cash_account_id=v_txn.destination_cash_account_id and v_line.debit=v_txn.amount/);
  assert.match(api, /importFinanceBankStatementLines = createServerFn/);
  assert.match(api, /matchFinanceBankStatementLine = createServerFn/);
  assert.match(api, /reverseFinanceCashTransaction = createServerFn/);
  assert.match(api, /getFinanceReports = createServerFn/);
  assert.match(api, /FINANCE_SOURCE_REVERSAL_REQUIRED/);
});

test("server APIs enforce finance permissions and validate monetary precision", () => {
  assert.match(api, /getFinanceOperations = createServerFn/);
  assert.match(api, /createFinanceCashAccount = createServerFn/);
  assert.match(api, /postFinanceCashTransaction = createServerFn/);
  assert.match(api, /gate\(sql, context\.userId, data\.orgId, "finance\.write"\)/);
  assert.match(api, /financeAmountUnits\(data\.amount\)/);
  assert.match(api, /async function ensureFinanceAccounts/);
  assert.match(api, /await ensureFinanceAccounts\(sql, data\.orgId\)/);
});

test("finance UI exposes cash accounts, vouchers, open partner balances and recent movements", () => {
  for (const token of ["الصندوق والبنوك", "المستحقات المفتوحة", "آخر حركات الصندوق والبنوك", "سند جديد", "تخصيص على فاتورة"]) {
    assert.ok(route.includes(token), `missing UI feature: ${token}`);
  }
  assert.match(route, /postFinanceCashTransaction/);
  assert.match(route, /createFinanceCashAccount/);
});
