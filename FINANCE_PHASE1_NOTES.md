# Smart Stock AI — Finance Foundation (Phase 1)

## Base used

This phase was merged onto the latest project archive supplied in the conversation:
`Smart-Stock-AI-Operational-Refinement(2).zip` (approximately 0.9 MB).
The uploaded archive passed `unzip -t` before modification. Existing UI refresh,
SaaS, tenant isolation, and operational files were retained; finance changes
were applied as a focused overlay rather than rebuilding from an older project.

## Included

- Tenant-scoped chart of accounts with a starter account set for each organization.
- Double-entry journal entries and journal lines.
- Posting guard: an entry must have at least two lines, positive value, and equal debit and credit totals.
- Exact currency handling at four decimal places using integer subunits; values with excess precision, negative values, malformed input, or unsafe totals are rejected.
- Posted entries and their lines are immutable; corrections use a separate reversal entry.
- Idempotency keys for journal creation and reversal, plus a unique reversal reference per original entry.
- Row-level security on all finance tables, using the existing verified organization context.
- Finance dashboard with current-organization-month revenue and expenses, net result, cash/bank balances, receivables, payables, account balances, and recent posted entries.
- Finance navigation and role permissions. Owners, administrators, managers, and accountants can write; auditors can view only. Existing explicit permission revocations continue to apply.
- Arabic and English labels, with the current organization timezone used for financial period boundaries and reversal dates.
- Date validation before a manual journal entry is written.

## Important scope boundary

This phase establishes the accounting ledger and manual journal workflow. It does **not yet** automatically post sales, purchase, returns, tax, inventory-cost, receipt, payment, or transfer transactions into the journal. Until those integrations are delivered and reconciled, dashboard totals represent posted finance-journal entries only and must not be treated as the company's complete statutory financial statements.

Cash/bank account management, receipts and payments, customer/supplier subledgers, full trial balance and financial statements, and automated document-to-journal posting are planned follow-on phases.

## Verification status (2026-11-18)

Passed:

- `scripts/finance-ledger.test.mjs`: 5/5.
- `src/lib/stock/finance-money.test.ts`: 3/3.
- `src/lib/stock/permissions.test.ts`: 2/2.
- `scripts/migration-plan.test.mjs`: 7/7.
- TypeScript syntax transpilation for the changed API, finance page, shell, permission, i18n, route-tree, and finance-money modules.
- Cross-check that the finance migration, route registration, permission-filtered navigation, and test-script wiring are present.
- Final ZIP integrity check.

Not completed / environment limitations:

- The full script suite reported 196 passing and 6 failing tests in the existing `scripts/grok-pwa-plugin.test.mjs` share-card/metadata cases; those failures are outside the finance changes.
- Some existing TypeScript test files could not start because dependencies such as `@tanstack/react-start`, `jose`, and `@electric-sql/pglite` are not installed in this extracted environment.
- `tsc --noEmit` could not run to completion because `@types/node` and `vite/client` are missing.
- Production build, browser-render QA, and applying the migration to a real PostgreSQL database were not performed. No production database credentials were used.
