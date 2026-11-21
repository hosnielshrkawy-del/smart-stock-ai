# Smart Stock AI — Finance Phase 2

## Base

Built on `Smart-Stock-AI-Finance-Phase1-Latest-Base.zip`, the Phase 1 release merged onto the user's latest uploaded `Smart-Stock-AI-Operational-Refinement(2).zip`.

## Implemented

### 1. Automated document-to-ledger posting

- Added migration `0006_finance_operations.sql`.
- A posted sales dispatch now posts a balanced journal entry for revenue, output VAT, cost of goods sold, and inventory reduction.
- Dispatches with a customer create a customer receivable document; dispatches without a customer are treated as cash sales against the default cash ledger account.
- A posted purchase receipt linked to a purchase order posts inventory, recoverable input VAT, and supplier payable entries.
- Partial purchase receipts prorate purchase-order shipping by the received subtotal rather than charging all shipping on every receipt.
- Opening stock, damage, issue, consumption, and stock adjustments post inventory valuation entries.
- Document journal creation is idempotent by source document. Reversing an eligible stock document creates a separate reversing journal entry.
- Reversal of a sale/purchase document with allocated payments is blocked until the financial settlement is handled; this avoids silently clearing a paid balance.

### 2. Cash, banks and vouchers

- Added tenant-scoped cash/bank/wallet accounts mapped to child ledger accounts.
- Existing organizations receive a main cash box and main bank account through the permission-checked finance bootstrap; new organizations seed the same defaults during creation. The additional tax/returns accounts are seeded through that same tenant-scoped bootstrap before stock posting, not by an unscoped migration insert.
- Added opening balance posting against opening equity.
- Added receipt, payment, transfer, expense and income vouchers.
- Each voucher and its journal entry are committed atomically and protected by an idempotency key.
- Vouchers can allocate receipts to sales documents and payments to purchase documents, including partial allocations.
- Cash voucher reversal creates a journal reversal, marks allocations reversed, recalculates document balances and unmatches statement lines.

### 3. Customer and supplier subledgers

- Automated dispatch/receipt postings create financial source documents for customer receivables and supplier payables.
- Open balances, paid amounts, outstanding amounts, due dates and aging buckets are exposed in the Finance workspace.
- Supplier payment terms containing a day count are used to calculate the purchase document due date.

### 4. Bank reconciliation

- Added bank statement line import API (up to 500 rows per request) and manual statement-line entry in the UI.
- Duplicate non-empty external references are ignored per bank account.
- Matching validates bank account, amount and debit/credit direction. Transfers can match either their source or destination bank side.

### 5. Financial reporting

- Added a date-bounded trial balance.
- Added an income statement summary: revenue, cost of goods, gross profit, operating expenses and net profit.
- Added a balance sheet summary with assets, liabilities and equity including retained earnings from posted revenue/expenses.
- Added cash movement summary based on posted journal lines for cash/bank ledger accounts.
- Added inventory valuation from on-hand quantity multiplied by product average cost.
- Added receivable/payable aging and unmatched bank statement visibility.

### 6. UI and controls

- Extended the Finance screen with cash/bank accounts, opening balances, voucher creation, optional invoice allocation, open receivables/payables, recent cash movements, cash reversal, bank statement line entry/matching, trial balance, profit/cash-flow metrics, balance-sheet metrics, aging and pending finance events.
- Kept the existing Arabic/English UI and finance permission gate.
- Manual journal reversals are now limited to manual entries. Automated stock and cash journals must be reversed through their source workflows.
- Added `scripts/finance-operations.test.mjs` covering tenant isolation, automated posting, idempotency, allocations, reversals, reconciliation, server permissions and UI entry points.

## Important scope boundaries / safe handling

- Stock returns (`return_in` / `return_out`), manual receipts without a purchase-order source, and dispatches without a sales-order source are placed in a Finance review queue instead of being posted automatically. The current workflows do not reliably bind every line to the exact original commercial line and its historical price/tax. The system deliberately avoids inventing those values. A follow-up needs explicit source-invoice/line allocation before those events can be automated safely.
- The current sales dispatch workflow is the source of the sale accounting event. A separate full POS checkout/tender workflow is not introduced in this phase.
- Bank statement entry is supported through the API and manual UI entry; a CSV/XLSX bank-file parser is not included yet.
- Multi-currency revaluation, formal jurisdiction-specific e-invoicing/tax filing, budgets, AI invoice OCR automation, and payment-provider integration remain separate follow-on work.
- Supplier payment terms are interpreted only when a numeric day count is present. Customer-specific credit terms are not yet stored by the current customer schema.

## Verification

Passed:

- New finance operations tests: 6/6.
- Finance ledger tests: 5/5.
- Money precision tests are still covered by the Phase 1 suite; no money parser logic was weakened.
- Migration-plan tests: 7/7.
- TypeScript/TSX transpilation syntax check for `src/lib/stock/api.ts` and `src/routes/finance.tsx`: no parse diagnostics.
- ZIP integrity check for the final archive.

Environment limitations:

- Full script suite: 202 passed, 6 failed, all six in existing `scripts/grok-pwa-plugin.test.mjs` share-card/metadata fixture cases.
- `npm ci --ignore-scripts --no-audit --no-fund` timed out; `node_modules` remains unavailable.
- `tsc --noEmit` could not complete because `@types/node` and `vite/client` are unavailable.
- Production build, browser-render QA, PGlite migration execution, and PostgreSQL integration tests were not run.
- No live customer database was accessed or modified.

Do not treat this archive as production-certified until migration 0006 and its accounting scenarios pass against a disposable PostgreSQL database, the production build passes, and browser QA completes.
