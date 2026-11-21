import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, BookOpen, Calculator, CircleDollarSign, FilePlus2, Landmark, Plus, RefreshCw, RotateCcw, Wallet } from "lucide-react";
import { Shell, useApp } from "@/components/shell";
import { Badge, Button, EmptyState, Field, MetricCard, Modal, PageHead, Panel, SelectInput, SkeletonRows, TextInput } from "@/components/ui";
import { Banner, useFmt, useSnap } from "@/components/work";
import { createFinanceCashAccount, createJournalEntry, getFinanceDashboard, getFinanceOperations, getFinanceReports, importFinanceBankStatementLines, matchFinanceBankStatementLine, postFinanceCashTransaction, reverseFinanceCashTransaction, reverseJournalEntry } from "@/lib/stock/api";
import { financeAmountUnits } from "@/lib/stock/finance-money";
import { createUuid } from "@/lib/uuid";

export const Route = createFileRoute("/finance")({ component: Page });

type FinanceLine = { accountId: string; description: string; debit: string; credit: string };

function orgToday(timezone: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  }
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "01";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function accountTypeLabel(type: string, lang: string) {
  const ar: Record<string, string> = { asset: "أصول", liability: "التزامات", equity: "حقوق ملكية", revenue: "إيرادات", expense: "مصروفات" };
  const en: Record<string, string> = { asset: "Assets", liability: "Liabilities", equity: "Equity", revenue: "Revenue", expense: "Expenses" };
  return (lang === "ar" ? ar : en)[type] ?? type;
}

function Page() {
  return <Shell><Finance /></Shell>;
}

function Finance() {
  const { org, lang, allowed, t } = useApp();
  const fmt = useFmt();
  const [modalOpen, setModalOpen] = useState(false);
  const [date, setDate] = useState(() => orgToday(org.timezone));
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<FinanceLine[]>([
    { accountId: "", description: "", debit: "", credit: "" },
    { accountId: "", description: "", debit: "", credit: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cashAccountModal, setCashAccountModal] = useState(false);
  const [cashAccountName, setCashAccountName] = useState("");
  const [cashAccountKind, setCashAccountKind] = useState<"cash" | "bank" | "wallet">("cash");
  const [cashOpeningBalance, setCashOpeningBalance] = useState("0");
  const [cashTxnModal, setCashTxnModal] = useState(false);
  const [cashTxnType, setCashTxnType] = useState<"receipt" | "payment" | "transfer" | "expense" | "income">("receipt");
  const [cashTxnAccount, setCashTxnAccount] = useState("");
  const [cashTxnDestination, setCashTxnDestination] = useState("");
  const [cashTxnOffset, setCashTxnOffset] = useState("");
  const [cashTxnDocument, setCashTxnDocument] = useState("");
  const [cashTxnAmount, setCashTxnAmount] = useState("");
  const [cashTxnDate, setCashTxnDate] = useState(() => orgToday(org.timezone));
  const [cashTxnDescription, setCashTxnDescription] = useState("");
  const [cashTxnBusy, setCashTxnBusy] = useState(false);
  const [cashTxnError, setCashTxnError] = useState("");
  const [bankLineModal, setBankLineModal] = useState(false);
  const [bankLineAccount, setBankLineAccount] = useState("");
  const [bankLineDate, setBankLineDate] = useState(() => orgToday(org.timezone));
  const [bankLineReference, setBankLineReference] = useState("");
  const [bankLineDescription, setBankLineDescription] = useState("");
  const [bankLineDebit, setBankLineDebit] = useState("");
  const [bankLineCredit, setBankLineCredit] = useState("");
  const [bankMatchSelection, setBankMatchSelection] = useState<Record<string, string>>({});
  const canView = allowed("finance.view");
  const canWrite = allowed("finance.write");
  const snap = useSnap(`finance:${org.id}`, () => getFinanceDashboard({ data: { orgId: org.id } }), [org.id]);
  const opsSnap = useSnap(`finance-operations:${org.id}`, () => getFinanceOperations({ data: { orgId: org.id } }), [org.id]);
  const ops = opsSnap.data;
  const reportFrom = `${orgToday(org.timezone).slice(0, 7)}-01`;
  const reportTo = orgToday(org.timezone);
  const reportsSnap = useSnap(`finance-reports:${org.id}:${reportFrom}`, () => getFinanceReports({ data: { orgId: org.id, fromDate: reportFrom, toDate: reportTo } }), [org.id, reportFrom]);
  const reports = reportsSnap.data;
  const reportData = reports?.ok ? reports : undefined;
  const data = snap.data;
  const totals = data?.totals;
  const accountOptions = useMemo(() => (data?.accounts ?? []).map((a: any) => ({
    id: String(a.id), label: `${a.code} · ${lang === "ar" ? a.nameAr : a.nameEn || a.nameAr}`,
  })), [data?.accounts, lang]);
  const parsedLines = lines.map((line) => ({ debit: financeAmountUnits(line.debit || "0"), credit: financeAmountUnits(line.credit || "0") }));
  const lineAmountsValid = parsedLines.every((line) => line.debit !== null && line.credit !== null && ((line.debit > 0) !== (line.credit > 0)));
  const debitTotalUnits = parsedLines.reduce((sum, line) => sum + (line.debit ?? 0), 0);
  const creditTotalUnits = parsedLines.reduce((sum, line) => sum + (line.credit ?? 0), 0);
  const balanced = lineAmountsValid && Number.isSafeInteger(debitTotalUnits) && debitTotalUnits === creditTotalUnits && debitTotalUnits > 0;
  const debitTotal = debitTotalUnits / 10000;
  const creditTotal = creditTotalUnits / 10000;

  const openNew = () => {
    setDate(orgToday(org.timezone));
    setDescription("");
    setLines([
      { accountId: accountOptions[0]?.id ?? "", description: "", debit: "", credit: "" },
      { accountId: accountOptions[7]?.id ?? "", description: "", debit: "", credit: "" },
    ]);
    setError("");
    setModalOpen(true);
  };

  const updateLine = (index: number, patch: Partial<FinanceLine>) => {
    setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  };

  const submit = async () => {
    setError("");
    if (!description.trim() || !date || !balanced || lines.some((line) => !line.accountId)) {
      setError(lang === "ar" ? "أكمل وصف القيد والحسابات وتأكد من توازن المدين والدائن." : "Complete the description and accounts, and balance debit and credit.");
      return;
    }
    setBusy(true);
    try {
      const result = await createJournalEntry({ data: {
        orgId: org.id,
        entryDate: date,
        description,
        idempotencyKey: createUuid(),
        lines: lines.map((line) => ({
          accountId: line.accountId,
          description: line.description,
          debit: line.debit || "0",
          credit: line.credit || "0",
        })),
      } });
      if (!result.ok) {
        setError(result.error === "FINANCE_UNBALANCED_ENTRY" ? (lang === "ar" ? "القيد غير متوازن." : "The journal entry is not balanced.") : result.error || t("common.error"));
      } else {
        setModalOpen(false);
        snap.reload();
      }
    } catch {
      setError(lang === "ar" ? "تعذر ترحيل القيد. راجع الصلاحيات والبيانات." : "Could not post the entry. Check permissions and data.");
    } finally {
      setBusy(false);
    }
  };

  const refreshFinance = () => { snap.reload(); opsSnap.reload(); };

  const saveCashAccount = async () => {
    if (!cashAccountName.trim()) return;
    setCashTxnBusy(true);
    try {
      const result = await createFinanceCashAccount({ data: { orgId: org.id, name: cashAccountName, accountKind: cashAccountKind, openingBalance: cashOpeningBalance } });
      if (!result.ok) { window.alert(result.error || t("common.error")); return; }
      setCashAccountModal(false); setCashAccountName(""); setCashOpeningBalance("0"); refreshFinance();
    } catch { window.alert(t("common.error")); }
    finally { setCashTxnBusy(false); }
  };

  const saveCashTransaction = async () => {
    setCashTxnError("");
    const accountId = cashTxnAccount || ops?.cashAccounts?.[0]?.id || "";
    if (!accountId || !cashTxnAmount || Number(cashTxnAmount) <= 0 || !cashTxnDescription.trim()) {
      setCashTxnError(lang === "ar" ? "أكمل الحساب والمبلغ والوصف." : "Complete the account, amount and description."); return;
    }
    if (cashTxnType === "transfer" && !cashTxnDestination) {
      setCashTxnError(lang === "ar" ? "اختر الحساب المستلم للتحويل." : "Choose the destination account."); return;
    }
    if (["expense", "income"].includes(cashTxnType) && !cashTxnOffset) {
      setCashTxnError(lang === "ar" ? "اختر حساب المصروف أو الإيراد المقابل." : "Choose the offset expense or income account."); return;
    }
    const selectedDoc = (ops?.documents ?? []).find((item: any) => item.id === cashTxnDocument);
    setCashTxnBusy(true);
    try {
      const result = await postFinanceCashTransaction({ data: {
        orgId: org.id, transactionType: cashTxnType, transactionDate: cashTxnDate,
        cashAccountId: accountId, destinationCashAccountId: cashTxnType === "transfer" ? cashTxnDestination : undefined,
        partnerType: selectedDoc?.partnerType, partnerId: selectedDoc?.partnerId,
        offsetAccountId: cashTxnOffset || undefined, amount: cashTxnAmount,
        description: cashTxnDescription, idempotencyKey: createUuid(),
        allocations: selectedDoc ? [{ financeDocumentId: selectedDoc.id, amount: cashTxnAmount }] : [],
      } });
      if (!result.ok) { setCashTxnError(result.error || t("common.error")); return; }
      setCashTxnModal(false); setCashTxnAmount(""); setCashTxnDescription(""); setCashTxnDocument("");
      refreshFinance();
    } catch { setCashTxnError(t("common.error")); }
    finally { setCashTxnBusy(false); }
  };

  const reverseCashTransaction = async (transactionId: string) => {
    const reason = window.prompt(lang === "ar" ? "اكتب سبب عكس السند:" : "Enter the reason for reversing this voucher:");
    if (!reason?.trim()) return;
    setCashTxnBusy(true);
    try {
      const result = await reverseFinanceCashTransaction({ data: { orgId: org.id, transactionId, reason, idempotencyKey: createUuid() } });
      if (!result.ok) window.alert(result.error || t("common.error"));
      refreshFinance();
    } catch { window.alert(t("common.error")); }
    finally { setCashTxnBusy(false); }
  };

  const importBankLine = async () => {
    const accountId = bankLineAccount || ops?.cashAccounts?.find((a: any) => a.accountKind === "bank")?.id || "";
    if (!accountId || (!!bankLineDebit === !!bankLineCredit) || Number(bankLineDebit || bankLineCredit) <= 0) {
      window.alert(lang === "ar" ? "اختر حسابًا بنكيًا وأدخل مدينًا أو دائنًا فقط." : "Choose a bank account and enter either debit or credit."); return;
    }
    setCashTxnBusy(true);
    try {
      const result = await importFinanceBankStatementLines({ data: { orgId: org.id, cashAccountId: accountId, lines: [{ externalReference: bankLineReference, transactionDate: bankLineDate, description: bankLineDescription, debit: bankLineDebit || "0", credit: bankLineCredit || "0" }] } });
      if (!result.ok) { window.alert(result.error || t("common.error")); return; }
      setBankLineModal(false); setBankLineReference(""); setBankLineDescription(""); setBankLineDebit(""); setBankLineCredit(""); opsSnap.reload();
    } catch { window.alert(t("common.error")); }
    finally { setCashTxnBusy(false); }
  };

  const matchBankLine = async (lineId: string) => {
    const transactionId = bankMatchSelection[lineId];
    if (!transactionId) return;
    setCashTxnBusy(true);
    try {
      const result = await matchFinanceBankStatementLine({ data: { orgId: org.id, statementLineId: lineId, cashTransactionId: transactionId } });
      if (!result.ok) window.alert(result.error || t("common.error"));
      else { opsSnap.reload(); setBankMatchSelection((current) => ({ ...current, [lineId]: "" })); }
    } catch { window.alert(t("common.error")); }
    finally { setCashTxnBusy(false); }
  };

  const reverse = async (entryId: string) => {
    const prompt = lang === "ar" ? "اكتب سبب عكس القيد:" : "Enter the reason for reversing this entry:";
    const why = window.prompt(prompt);
    if (!why?.trim()) return;
    setBusy(true);
    try {
      const result = await reverseJournalEntry({ data: { orgId: org.id, entryId, reason: why, idempotencyKey: createUuid() } });
      if (!result.ok) window.alert(result.error === "FINANCE_ALREADY_REVERSED" ? (lang === "ar" ? "تم عكس هذا القيد من قبل." : "This entry was already reversed.") : t("common.error"));
      snap.reload();
    } catch {
      window.alert(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  if (!canView) {
    return <div className="rounded-2xl border border-line bg-surface p-6 text-sm text-muted">{lang === "ar" ? "ليس لديك صلاحية عرض الإدارة المالية." : "You do not have permission to view Finance."}</div>;
  }

  return (
    <>
      <PageHead
        crumb={`${org.name} / ${t("nav.finance")}`}
        title={t("nav.finance")}
        hint={lang === "ar" ? "دفتر محاسبي مزدوج القيد، وسجل مالي قابل للتدقيق." : "Double-entry accounting with an auditable financial journal."}
        actions={<>
          <Button variant="quiet" onClick={refreshFinance}><RefreshCw className="me-2 h-4 w-4" />{lang === "ar" ? "تحديث" : "Refresh"}</Button>
          {canWrite ? <Button disabled={!accountOptions.length} onClick={openNew}><FilePlus2 className="me-2 h-4 w-4" />{lang === "ar" ? "قيد يومية جديد" : "New journal entry"}</Button> : null}
        </>}
      />
      <Banner code={snap.error} local={snap.local} />
      {snap.loading && !data ? <SkeletonRows /> : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label={lang === "ar" ? "إيرادات الشهر" : "Monthly revenue"} value={fmt.money(totals?.revenue ?? 0)} icon={<ArrowDownLeft className="h-5 w-5" />} tone="teal" />
            <MetricCard label={lang === "ar" ? "مصروفات الشهر" : "Monthly expenses"} value={fmt.money(totals?.expenses ?? 0)} icon={<ArrowUpRight className="h-5 w-5" />} tone="warning" />
            <MetricCard label={lang === "ar" ? "صافي نتيجة الشهر" : "Monthly net result"} value={fmt.money(totals?.netProfit ?? 0)} icon={<Calculator className="h-5 w-5" />} tone={Number(totals?.netProfit ?? 0) >= 0 ? "teal" : "danger"} />
            <MetricCard label={lang === "ar" ? "النقدية بالصندوق والبنوك" : "Cash and banks"} value={fmt.money(totals?.cash ?? 0)} icon={<Wallet className="h-5 w-5" />} />
          </div>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard label={lang === "ar" ? "مستحقات العملاء" : "Receivables"} value={fmt.money(totals?.receivables ?? 0)} icon={<CircleDollarSign className="h-5 w-5" />} />
            <MetricCard label={lang === "ar" ? "مستحقات الموردين" : "Payables"} value={fmt.money(totals?.payables ?? 0)} icon={<BookOpen className="h-5 w-5" />} />
            <MetricCard label={lang === "ar" ? "القيود المرحلة" : "Posted journal entries"} value={String(totals?.journalCount ?? 0)} icon={<Calculator className="h-5 w-5" />} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Panel>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">{lang === "ar" ? "أحدث القيود اليومية" : "Recent journal entries"}</h2>
                  <p className="mt-1 text-xs text-muted">{lang === "ar" ? "القيود المرحلة فقط، مع إمكانية إنشاء قيد عكسي موثق." : "Posted entries only, with traceable reversal."}</p>
                </div>
                <Badge tone="good">{lang === "ar" ? "متوازن" : "Balanced"}</Badge>
              </div>
              {data?.recent?.length ? <div className="divide-y divide-line">
                {data.recent.map((entry: any) => (
                  <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-teal">{entry.entryNo}</span>
                        {entry.reversesEntryId ? <Badge tone="warn">{lang === "ar" ? "قيد عكسي" : "Reversal"}</Badge> : null}
                        {entry.isReversed ? <Badge tone="neutral">{lang === "ar" ? "تم عكسه" : "Reversed"}</Badge> : null}
                      </div>
                      <p className="mt-1 truncate text-sm font-medium">{entry.description}</p>
                      <p className="mt-1 text-xs text-muted">{entry.entryDate} · {entry.lineCount} {lang === "ar" ? "سطور" : "lines"}</p>
                    </div>
                    <div className="text-end">
                      <p className="text-sm font-semibold tabular-nums">{fmt.money(entry.debit)}</p>
                      <p className="text-[11px] text-muted">{lang === "ar" ? "مدين = دائن" : "Debit = Credit"}</p>
                    </div>
                    {canWrite && entry.sourceType === "manual" && !entry.reversesEntryId && !entry.isReversed ? <Button className="h-9 px-2 text-xs" variant="quiet" disabled={busy} onClick={() => void reverse(entry.id)}><RotateCcw className="me-1 h-3.5 w-3.5" />{lang === "ar" ? "عكس" : "Reverse"}</Button> : null}
                  </div>
                ))}
              </div> : <div className="p-4"><EmptyState title={lang === "ar" ? "لا توجد قيود مالية بعد. ابدأ بقيد يومية متوازن." : "No financial entries yet. Start with a balanced journal entry."} action={canWrite ? <Button disabled={!accountOptions.length} onClick={openNew}>{lang === "ar" ? "إنشاء أول قيد" : "Create first entry"}</Button> : null} /></div>}
            </Panel>

            <Panel>
              <div className="border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold">{lang === "ar" ? "دليل الحسابات" : "Chart of accounts"}</h2>
                <p className="mt-1 text-xs text-muted">{lang === "ar" ? "أرصدة الحسابات الناتجة عن القيود المرحلة." : "Balances calculated from posted journal entries."}</p>
              </div>
              <div className="max-h-[520px] divide-y divide-line overflow-auto">
                {(data?.accounts ?? []).map((account: any) => (
                  <div key={account.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium">{account.code} · {lang === "ar" ? account.nameAr : account.nameEn || account.nameAr}</p>
                      <p className="mt-0.5 text-[10px] text-muted">{accountTypeLabel(account.accountType, lang)}</p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold tabular-nums">{fmt.money(account.balance)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1.25fr]">
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">{lang === "ar" ? "الصندوق والبنوك" : "Cash & bank accounts"}</h2>
                  <p className="mt-1 text-xs text-muted">{lang === "ar" ? "أرصدة مرتبطة مباشرة بدفتر الأستاذ." : "Balances linked directly to the general ledger."}</p>
                </div>
                {canWrite ? <div className="flex gap-2"><Button variant="quiet" className="h-9 px-2 text-xs" onClick={() => { setCashAccountName(""); setCashOpeningBalance("0"); setCashAccountModal(true); }}><Plus className="me-1 h-3.5 w-3.5" />{lang === "ar" ? "حساب جديد" : "New account"}</Button><Button className="h-9 px-2 text-xs" onClick={() => { setCashTxnType("receipt"); setCashTxnDate(orgToday(org.timezone)); setCashTxnError(""); setCashTxnModal(true); }}><Banknote className="me-1 h-3.5 w-3.5" />{lang === "ar" ? "سند جديد" : "New voucher"}</Button></div> : null}
              </div>
              <div className="divide-y divide-line">
                {(ops?.cashAccounts ?? []).map((account: any) => (
                  <div key={account.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3"><div className="rounded-xl bg-surface-2 p-2 text-teal">{account.accountKind === "bank" ? <Landmark className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}</div><div className="min-w-0"><p className="truncate text-sm font-medium">{account.name}</p><p className="text-[11px] text-muted">{account.accountCode} · {account.accountKind === "bank" ? (lang === "ar" ? "بنك" : "Bank") : (lang === "ar" ? "خزينة" : "Cash box")}</p></div></div>
                    <strong className="shrink-0 text-sm tabular-nums">{fmt.money(account.balance)}</strong>
                  </div>
                ))}
                {!ops?.cashAccounts?.length ? <div className="p-4 text-sm text-muted">{lang === "ar" ? "لا توجد خزائن أو حسابات بنكية." : "No cash or bank accounts yet."}</div> : null}
              </div>
            </Panel>
            <Panel>
              <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">{lang === "ar" ? "المستحقات المفتوحة" : "Open receivables & payables"}</h2><p className="mt-1 text-xs text-muted">{lang === "ar" ? "فواتير المبيعات والمشتريات التي لم تسدد بالكامل." : "Sales and purchase documents not fully settled."}</p></div>
              <div className="max-h-[320px] divide-y divide-line overflow-auto">
                {(ops?.documents ?? []).map((doc: any) => (
                  <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0"><div className="flex items-center gap-2"><span className="font-mono text-xs text-teal">{doc.documentNo}</span><Badge tone={doc.documentType === "sale" ? "info" : "warn"}>{doc.documentType === "sale" ? (lang === "ar" ? "عميل" : "Customer") : (lang === "ar" ? "مورد" : "Supplier")}</Badge></div><p className="mt-1 truncate text-sm">{lang === "ar" ? doc.partnerNameAr || doc.partnerId : doc.partnerNameEn || doc.partnerNameAr || doc.partnerId}</p><p className="text-[11px] text-muted">{doc.dueDate ? `${lang === "ar" ? "الاستحقاق" : "Due"}: ${doc.dueDate}` : doc.documentDate}</p></div>
                    <div className="text-end"><strong className="text-sm tabular-nums">{fmt.money(doc.outstanding)}</strong><p className="text-[11px] text-muted">{lang === "ar" ? "المتبقي" : "Outstanding"}</p></div>
                  </div>
                ))}
                {!ops?.documents?.length ? <div className="p-4 text-sm text-muted">{lang === "ar" ? "لا توجد فواتير مفتوحة." : "No open documents."}</div> : null}
              </div>
            </Panel>
          </div>

          <Panel>
            <div className="flex items-center justify-between border-b border-line px-4 py-3"><div><h2 className="text-sm font-semibold">{lang === "ar" ? "آخر حركات الصندوق والبنوك" : "Recent cash & bank movements"}</h2><p className="mt-1 text-xs text-muted">{lang === "ar" ? "كل سند مرتبط بقيد يومية تلقائي." : "Every voucher is linked to an automatic journal entry."}</p></div><Badge tone="good">{lang === "ar" ? "مترحلة" : "Posted"}</Badge></div>
            <div className="divide-y divide-line">
              {(ops?.transactions ?? []).map((txn: any) => <div key={txn.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="text-xs font-medium">{txn.transactionNo} · {txn.cashAccountName}</p><p className="mt-1 truncate text-sm">{txn.description}</p><p className="text-[11px] text-muted">{txn.transactionDate} · {txn.reference || txn.transactionType}</p>{txn.status === "reversed" ? <Badge tone="neutral">{lang === "ar" ? "معكوس" : "Reversed"}</Badge> : null}</div><div className="flex items-center gap-2"><strong className="text-sm tabular-nums">{fmt.money(txn.amount)}</strong>{canWrite && txn.status !== "reversed" ? <Button variant="quiet" className="h-8 px-2 text-xs" disabled={cashTxnBusy} onClick={() => void reverseCashTransaction(txn.id)}><RotateCcw className="me-1 h-3.5 w-3.5" />{lang === "ar" ? "عكس" : "Reverse"}</Button> : null}</div></div>)}
              {!ops?.transactions?.length ? <div className="p-4 text-sm text-muted">{lang === "ar" ? "لا توجد حركات مالية حتى الآن." : "No cash movements yet."}</div> : null}
            </div>
          </Panel>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <Panel>
              <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">{lang === "ar" ? "ملخص الأرباح والتدفقات" : "Profit & cash flow summary"}</h2><p className="mt-1 text-xs text-muted">{reportFrom} — {reportTo}</p></div>
              <div className="grid grid-cols-2 gap-3 p-4">
                <MetricCard label={lang === "ar" ? "مجمل الربح" : "Gross profit"} value={fmt.money(reportData?.incomeStatement?.grossProfit ?? 0)} />
                <MetricCard label={lang === "ar" ? "صافي الربح" : "Net profit"} value={fmt.money(reportData?.incomeStatement?.netProfit ?? 0)} tone={Number(reportData?.incomeStatement?.netProfit ?? 0) >= 0 ? "teal" : "danger"} />
                <MetricCard label={lang === "ar" ? "التدفقات الداخلة" : "Cash inflows"} value={fmt.money(reportData?.cashflow?.inflows ?? 0)} />
                <MetricCard label={lang === "ar" ? "التدفقات الخارجة" : "Cash outflows"} value={fmt.money(reportData?.cashflow?.outflows ?? 0)} />
                <MetricCard label={lang === "ar" ? "قيمة المخزون بالتكلفة" : "Inventory at cost"} value={fmt.money(reportData?.inventory?.value ?? 0)} />
                <MetricCard label={lang === "ar" ? "صافي التدفق النقدي" : "Net cash flow"} value={fmt.money(reportData?.cashflow?.net ?? 0)} />
                <MetricCard label={lang === "ar" ? "إجمالي الأصول" : "Total assets"} value={fmt.money(reportData?.balanceSheet?.assets ?? 0)} />
                <MetricCard label={lang === "ar" ? "الالتزامات وحقوق الملكية" : "Liabilities & equity"} value={fmt.money(Number(reportData?.balanceSheet?.liabilities ?? 0)+Number(reportData?.balanceSheet?.equity ?? 0))} />
              </div>
            </Panel>
            <Panel>
              <div className="flex items-center justify-between border-b border-line px-4 py-3"><div><h2 className="text-sm font-semibold">{lang === "ar" ? "التسوية البنكية" : "Bank reconciliation"}</h2><p className="mt-1 text-xs text-muted">{lang === "ar" ? `حركات غير مطابقة: ${ops?.statementSummary?.unmatchedCount ?? 0}` : `Unmatched lines: ${ops?.statementSummary?.unmatchedCount ?? 0}`}</p></div>{canWrite ? <Button variant="quiet" className="h-9 px-2 text-xs" onClick={() => { setBankLineAccount(ops?.cashAccounts?.find((a: any) => a.accountKind === "bank")?.id || ""); setBankLineModal(true); }}><Plus className="me-1 h-3.5 w-3.5" />{lang === "ar" ? "إضافة حركة كشف" : "Add statement line"}</Button> : null}</div>
              <div className="max-h-[300px] divide-y divide-line overflow-auto">
                {(ops?.statementLines ?? []).map((line: any) => <div key={line.id} className="space-y-2 px-4 py-3"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><p className="text-xs font-medium">{line.cashAccountName} · {line.externalReference || line.transactionDate}</p><p className="truncate text-xs text-muted">{line.description}</p></div><strong className="text-xs tabular-nums">{fmt.money(Number(line.debit) || Number(line.credit))}</strong></div>{canWrite ? <div className="flex gap-2"><SelectInput value={bankMatchSelection[line.id] || ""} onChange={(e) => setBankMatchSelection((current) => ({ ...current, [line.id]: e.target.value }))}><option value="">{lang === "ar" ? "اختر الحركة المطابقة" : "Choose matching movement"}</option>{(ops?.transactions ?? []).map((txn: any) => <option key={txn.id} value={txn.id}>{txn.transactionNo} · {txn.cashAccountName} · {fmt.money(txn.amount)}</option>)}</SelectInput><Button className="h-9 shrink-0 px-3 text-xs" disabled={!bankMatchSelection[line.id] || cashTxnBusy} onClick={() => void matchBankLine(line.id)}>{lang === "ar" ? "مطابقة" : "Match"}</Button></div> : null}</div>)}
                {!ops?.statementLines?.length ? <div className="p-4 text-sm text-muted">{lang === "ar" ? "لا توجد حركات كشف بنكي غير مطابقة." : "No unmatched statement lines."}</div> : null}
              </div>
            </Panel>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <Panel>
              <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">{lang === "ar" ? "ميزان المراجعة" : "Trial balance"}</h2><p className="mt-1 text-xs text-muted">{lang === "ar" ? "أرصدة الحسابات المرحلة حتى تاريخ التقرير." : "Posted account balances through the report date."}</p></div>
              <div className="max-h-[360px] overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-surface-2 text-muted"><tr><th className="p-2 text-start">{lang === "ar" ? "الحساب" : "Account"}</th><th className="p-2 text-end">{lang === "ar" ? "مدين" : "Debit"}</th><th className="p-2 text-end">{lang === "ar" ? "دائن" : "Credit"}</th></tr></thead><tbody>{(reportData?.trialBalance ?? []).map((account: any) => <tr key={account.id} className="border-t border-line"><td className="p-2"><span className="font-mono">{account.code}</span> · {lang === "ar" ? account.nameAr : account.nameEn || account.nameAr}</td><td className="p-2 text-end tabular-nums">{fmt.money(account.debit)}</td><td className="p-2 text-end tabular-nums">{fmt.money(account.credit)}</td></tr>)}</tbody></table></div>
            </Panel>
            <Panel>
              <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">{lang === "ar" ? "أعمار الديون" : "Receivable & payable aging"}</h2><p className="mt-1 text-xs text-muted">{lang === "ar" ? "توزيع الفواتير المفتوحة حسب تاريخ الاستحقاق." : "Open documents grouped by due date."}</p></div>
              <div className="divide-y divide-line">{(ops?.aging ?? []).map((item: any) => <div key={item.documentType} className="p-4"><p className="mb-2 text-sm font-semibold">{item.documentType === "sale" ? (lang === "ar" ? "مستحقات العملاء" : "Receivables") : (lang === "ar" ? "مستحقات الموردين" : "Payables")}</p><div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><div><span className="text-muted">{lang === "ar" ? "غير متأخر" : "Current"}</span><p className="mt-1 font-semibold tabular-nums">{fmt.money(item.current)}</p></div><div><span className="text-muted">1–30</span><p className="mt-1 font-semibold tabular-nums">{fmt.money(item.days30)}</p></div><div><span className="text-muted">31–60</span><p className="mt-1 font-semibold tabular-nums">{fmt.money(item.days60)}</p></div><div><span className="text-muted">{lang === "ar" ? "أكثر من 60" : "Over 60"}</span><p className="mt-1 font-semibold tabular-nums">{fmt.money(item.over60)}</p></div></div></div>)}{!ops?.aging?.length ? <div className="p-4 text-sm text-muted">{lang === "ar" ? "لا توجد ذمم مفتوحة." : "No open balances."}</div> : null}</div>
            </Panel>
          </div>

          {(ops?.pendingEvents ?? []).length ? <Panel className="mt-5"><div className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">{lang === "ar" ? "عمليات تحتاج مراجعة مالية" : "Finance events requiring review"}</h2><p className="mt-1 text-xs text-muted">{lang === "ar" ? "تحتاج هذه المستندات إلى ربطها بمصدرها التجاري قبل إنشاء القيد، حتى لا تُقدّر تكلفة أو ضريبة دون مستند أصلي." : "These documents need their commercial source before posting, so cost or tax is never guessed."}</p></div><div className="divide-y divide-line">{ops.pendingEvents.map((event: any) => <div key={event.id} className="px-4 py-3"><p className="text-sm font-medium">{event.documentNo}</p><p className="mt-1 text-xs text-muted">{event.message}</p></div>)}</div></Panel> : null}
        </>
      )}

      <Modal open={bankLineModal} onClose={() => setBankLineModal(false)} title={lang === "ar" ? "إضافة حركة من كشف البنك" : "Add bank statement line"}>
        <div className="space-y-3"><Field label={lang === "ar" ? "الحساب البنكي" : "Bank account"}><SelectInput value={bankLineAccount} onChange={(e) => setBankLineAccount(e.target.value)}>{(ops?.cashAccounts ?? []).filter((a: any) => a.accountKind === "bank").map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectInput></Field><Field label={lang === "ar" ? "التاريخ" : "Date"}><TextInput type="date" value={bankLineDate} onChange={(e) => setBankLineDate(e.target.value)} /></Field><Field label={lang === "ar" ? "المرجع البنكي" : "Bank reference"}><TextInput value={bankLineReference} onChange={(e) => setBankLineReference(e.target.value)} /></Field><Field label={lang === "ar" ? "الوصف" : "Description"}><TextInput value={bankLineDescription} onChange={(e) => setBankLineDescription(e.target.value)} /></Field><div className="grid grid-cols-2 gap-3"><Field label={lang === "ar" ? "مدين" : "Debit"}><TextInput type="number" min="0" step="0.0001" value={bankLineDebit} onChange={(e) => { setBankLineDebit(e.target.value); if (e.target.value) setBankLineCredit(""); }} /></Field><Field label={lang === "ar" ? "دائن" : "Credit"}><TextInput type="number" min="0" step="0.0001" value={bankLineCredit} onChange={(e) => { setBankLineCredit(e.target.value); if (e.target.value) setBankLineDebit(""); }} /></Field></div><div className="flex justify-end gap-2"><Button variant="quiet" onClick={() => setBankLineModal(false)}>{t("common.cancel")}</Button><Button disabled={cashTxnBusy} onClick={() => void importBankLine()}>{lang === "ar" ? "حفظ الحركة" : "Save statement line"}</Button></div></div>
      </Modal>

      <Modal open={cashAccountModal} onClose={() => setCashAccountModal(false)} title={lang === "ar" ? "إضافة خزينة أو حساب بنكي" : "Add cash or bank account"}>
        <div className="space-y-4"><Field label={lang === "ar" ? "اسم الحساب" : "Account name"}><TextInput value={cashAccountName} onChange={(e) => setCashAccountName(e.target.value)} placeholder={lang === "ar" ? "مثال: خزينة الفرع الرئيسي" : "e.g. Main branch cash"} /></Field><Field label={lang === "ar" ? "نوع الحساب" : "Account type"}><SelectInput value={cashAccountKind} onChange={(e) => setCashAccountKind(e.target.value as "cash" | "bank" | "wallet")}><option value="cash">{lang === "ar" ? "خزينة" : "Cash"}</option><option value="bank">{lang === "ar" ? "حساب بنكي" : "Bank"}</option><option value="wallet">{lang === "ar" ? "محفظة إلكترونية" : "Wallet"}</option></SelectInput></Field><Field label={lang === "ar" ? "الرصيد الافتتاحي" : "Opening balance"}><TextInput type="number" min="0" step="0.0001" value={cashOpeningBalance} onChange={(e) => setCashOpeningBalance(e.target.value)} /></Field><div className="flex justify-end gap-2"><Button variant="quiet" onClick={() => setCashAccountModal(false)}>{t("common.cancel")}</Button><Button disabled={cashTxnBusy || !cashAccountName.trim()} onClick={() => void saveCashAccount()}>{lang === "ar" ? "حفظ الحساب" : "Save account"}</Button></div></div>
      </Modal>

      <Modal open={cashTxnModal} onClose={() => setCashTxnModal(false)} title={lang === "ar" ? "تسجيل حركة مالية" : "Record cash movement"} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={lang === "ar" ? "نوع الحركة" : "Transaction type"}><SelectInput value={cashTxnType} onChange={(e) => { setCashTxnType(e.target.value as typeof cashTxnType); setCashTxnDocument(""); }}><option value="receipt">{lang === "ar" ? "سند قبض" : "Receipt"}</option><option value="payment">{lang === "ar" ? "سند صرف" : "Payment"}</option><option value="transfer">{lang === "ar" ? "تحويل بين حسابات" : "Transfer"}</option><option value="expense">{lang === "ar" ? "مصروف نقدي" : "Cash expense"}</option><option value="income">{lang === "ar" ? "إيراد نقدي" : "Cash income"}</option></SelectInput></Field>
          <Field label={lang === "ar" ? "التاريخ" : "Date"}><TextInput type="date" value={cashTxnDate} onChange={(e) => setCashTxnDate(e.target.value)} /></Field>
          <Field label={lang === "ar" ? "الحساب المصدر" : "Source account"}><SelectInput value={cashTxnAccount || ops?.cashAccounts?.[0]?.id || ""} onChange={(e) => setCashTxnAccount(e.target.value)}>{(ops?.cashAccounts ?? []).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectInput></Field>
          {cashTxnType === "transfer" ? <Field label={lang === "ar" ? "الحساب المستلم" : "Destination account"}><SelectInput value={cashTxnDestination} onChange={(e) => setCashTxnDestination(e.target.value)}><option value="">{lang === "ar" ? "اختر الحساب" : "Choose account"}</option>{(ops?.cashAccounts ?? []).filter((a: any) => a.id !== (cashTxnAccount || ops?.cashAccounts?.[0]?.id)).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectInput></Field> : null}
          {["expense", "income"].includes(cashTxnType) ? <Field label={lang === "ar" ? "الحساب المقابل" : "Offset account"}><SelectInput value={cashTxnOffset} onChange={(e) => setCashTxnOffset(e.target.value)}><option value="">{lang === "ar" ? "اختر الحساب" : "Choose account"}</option>{accountOptions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</SelectInput></Field> : null}
          {cashTxnType === "receipt" || cashTxnType === "payment" ? <Field label={lang === "ar" ? "تخصيص على فاتورة (اختياري)" : "Allocate to document (optional)"}><SelectInput value={cashTxnDocument} onChange={(e) => setCashTxnDocument(e.target.value)}><option value="">{lang === "ar" ? "بدون تخصيص" : "No allocation"}</option>{(ops?.documents ?? []).filter((d: any) => d.documentType === (cashTxnType === "receipt" ? "sale" : "purchase")).map((d: any) => <option key={d.id} value={d.id}>{d.documentNo} · {d.partnerNameAr || d.partnerId} · {fmt.money(d.outstanding)}</option>)}</SelectInput></Field> : null}
          <Field label={lang === "ar" ? "المبلغ" : "Amount"}><TextInput type="number" min="0.0001" step="0.0001" value={cashTxnAmount} onChange={(e) => setCashTxnAmount(e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label={lang === "ar" ? "البيان / الوصف" : "Description"}><TextInput value={cashTxnDescription} onChange={(e) => setCashTxnDescription(e.target.value)} placeholder={lang === "ar" ? "اكتب تفاصيل الحركة" : "Describe the transaction"} /></Field></div>
        </div>
        {cashTxnError ? <p className="mt-3 text-sm text-danger">{cashTxnError}</p> : null}
        <div className="mt-4 flex justify-end gap-2"><Button variant="quiet" onClick={() => setCashTxnModal(false)}>{t("common.cancel")}</Button><Button disabled={cashTxnBusy} onClick={() => void saveCashTransaction()}>{cashTxnBusy ? (lang === "ar" ? "جارٍ الحفظ…" : "Saving…") : (lang === "ar" ? "حفظ وترحيل" : "Save & post")}</Button></div>
      </Modal>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={lang === "ar" ? "إنشاء قيد يومية وترحيله" : "Create and post journal entry"} wide>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={lang === "ar" ? "تاريخ القيد" : "Entry date"}><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label={lang === "ar" ? "وصف القيد" : "Description"}><TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder={lang === "ar" ? "مثال: إثبات مصروفات تشغيلية" : "e.g. Operating expenses"} /></Field>
          </div>
          <div className="space-y-3">
            {lines.map((line, index) => (
              <div key={index} className="grid gap-2 rounded-xl border border-line bg-surface-2 p-3 sm:grid-cols-[minmax(0,1.5fr)_1fr_1fr_auto]">
                <Field label={lang === "ar" ? `الحساب ${index + 1}` : `Account ${index + 1}`}>
                  <SelectInput value={line.accountId} onChange={(e) => updateLine(index, { accountId: e.target.value })}>
                    <option value="">{lang === "ar" ? "اختر الحساب" : "Choose account"}</option>
                    {accountOptions.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
                  </SelectInput>
                </Field>
                <Field label={lang === "ar" ? "مدين" : "Debit"}><TextInput type="number" min="0" step="0.0001" value={line.debit} onChange={(e) => updateLine(index, { debit: e.target.value, credit: e.target.value ? "0" : line.credit })} /></Field>
                <Field label={lang === "ar" ? "دائن" : "Credit"}><TextInput type="number" min="0" step="0.0001" value={line.credit} onChange={(e) => updateLine(index, { credit: e.target.value, debit: e.target.value ? "0" : line.debit })} /></Field>
                <div className="flex items-end"><Button type="button" variant="quiet" className="h-9 px-2" disabled={lines.length <= 2} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>×</Button></div>
              </div>
            ))}
            <Button type="button" variant="quiet" onClick={() => setLines((current) => [...current, { accountId: "", description: "", debit: "", credit: "" }])}>+ {lang === "ar" ? "إضافة سطر" : "Add line"}</Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 p-3 text-sm">
            <span>{lang === "ar" ? "إجمالي المدين" : "Total debit"}: <strong className="tabular-nums">{fmt.money(debitTotal)}</strong></span>
            <span>{lang === "ar" ? "إجمالي الدائن" : "Total credit"}: <strong className="tabular-nums">{fmt.money(creditTotal)}</strong></span>
            <Badge tone={balanced ? "good" : "warn"}>{balanced ? (lang === "ar" ? "القيد متوازن" : "Balanced") : (lang === "ar" ? "غير متوازن" : "Unbalanced")}</Badge>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="quiet" onClick={() => setModalOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => void submit()} disabled={busy || !balanced}>{busy ? (lang === "ar" ? "جارٍ الترحيل…" : "Posting…") : (lang === "ar" ? "ترحيل القيد" : "Post entry")}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}