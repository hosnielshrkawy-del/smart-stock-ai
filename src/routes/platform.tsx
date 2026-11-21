import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell, useApp } from "@/components/shell";
import { Badge, Button, Field, Modal, PageHead, Panel, SelectInput, TextArea, TextInput } from "@/components/ui";
import { getPlatformConsole, savePlatformMarketPrice, savePlatformPlan } from "@/lib/stock/api";


export const Route = createFileRoute("/platform")({ component: Page });
function Page() { return <Shell><PlatformConsole /></Shell>; }

type Plan = {
  id: string; code: string; nameAr: string; nameEn: string; description: string;
  isPublic: boolean; isActive: boolean; sortOrder: number; limits: unknown; features: unknown;
};
type Price = {
  id: string; planId: string; planCode: string; countryCode: string; currency: string;
  monthlyPriceMinor: string; annualPriceMinor: string; active: boolean;
};
type Audit = { action: string; entity: string; entityId: string; actorUserId: string; createdAt: string; detail: unknown };
type ConsoleData = { role: string; plans: Plan[]; prices: Price[]; recentAudit: Audit[] };
type PlanDraft = {
  id: string; description: string; isPublic: boolean; isActive: boolean;
  sortOrder: string; limits: string; features: string;
};

const COUNTRIES = [
  ["EG", "مصر", "EGP"], ["SA", "السعودية", "SAR"], ["AE", "الإمارات", "AED"],
  ["KW", "الكويت", "KWD"], ["QA", "قطر", "QAR"], ["BH", "البحرين", "BHD"],
  ["OM", "عُمان", "OMR"], ["JO", "الأردن", "JOD"], ["LB", "لبنان", "LBP"],
  ["IQ", "العراق", "IQD"], ["YE", "اليمن", "YER"], ["SY", "سوريا", "SYP"],
  ["PS", "فلسطين", "ILS"], ["MA", "المغرب", "MAD"], ["DZ", "الجزائر", "DZD"],
  ["TN", "تونس", "TND"], ["LY", "ليبيا", "LYD"], ["SD", "السودان", "SDG"],
  ["MR", "موريتانيا", "MRU"], ["SO", "الصومال", "SOS"], ["DJ", "جيبوتي", "DJF"],
  ["KM", "جزر القمر", "KMF"],
] as const;

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* display empty object for invalid cached data */ }
  }
  return {};
}

function money(minor: string, currency: string, lang: string) {
  try {
    const options = { style: "currency" as const, currency };
    const digits = new Intl.NumberFormat("en", options).resolvedOptions().maximumFractionDigits;
    return new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en", options)
      .format(Number(minor) / (10 ** digits));
  } catch { return `${minor} ${currency} (minor units)`; }
}

function date(value: string, lang: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function PlatformConsole() {
  const { lang, t } = useApp();
  const rtl = lang === "ar";
  const [data, setData] = useState<ConsoleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [price, setPrice] = useState({
    planId: "", countryCode: "EG", currency: "EGP", monthlyAmount: "", annualAmount: "", active: true,
  });
  const canWrite = data?.role === "super_admin";

  useEffect(() => {
    let live = true;
    setLoading(true);
    getPlatformConsole()
      .then((result) => { if (live) { setData(result as ConsoleData); setError(""); } })
      .catch((cause: unknown) => { if (live) setError(cause instanceof Error ? cause.message : "FORBIDDEN"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [reloadCount]);

  function openPlan(plan: Plan) {
    setDraft({
      id: plan.id,
      description: plan.description,
      isPublic: plan.isPublic,
      isActive: plan.isActive,
      sortOrder: String(plan.sortOrder),
      limits: JSON.stringify(objectValue(plan.limits), null, 2),
      features: JSON.stringify(objectValue(plan.features), null, 2),
    });
    setMessage("");
    setEditOpen(true);
  }

  async function savePlan() {
    if (!draft) return;
    setBusy(true); setMessage("");
    try {
      const limits = JSON.parse(draft.limits) as Record<string, unknown>;
      const features = JSON.parse(draft.features) as Record<string, unknown>;
      const result = await savePlatformPlan({ data: {
        planId: draft.id, description: draft.description, isPublic: draft.isPublic,
        isActive: draft.isActive, sortOrder: Number(draft.sortOrder), limits, features,
      } });
      if (!result.ok) { setMessage(result.error); return; }
      setEditOpen(false); setReloadCount((value) => value + 1);
    } catch (cause) {
      setMessage(cause instanceof SyntaxError ? (rtl ? "تحقق من صيغة JSON." : "Check the JSON format.") : cause instanceof Error ? cause.message : "VALIDATION");
    } finally { setBusy(false); }
  }

  async function savePrice() {
    setBusy(true); setMessage("");
    try {
      const result = await savePlatformMarketPrice({ data: price });
      if (!result.ok) { setMessage(result.error); return; }
      setMessage(rtl ? "تم حفظ سعر السوق." : "Market price saved.");
      setReloadCount((value) => value + 1);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "VALIDATION");
    } finally { setBusy(false); }
  }

  const plans = data?.plans ?? [];
  const prices = data?.prices ?? [];
  return <>
    <PageHead
      crumb={t("nav.platform")}
      title={rtl ? "إدارة المنصة" : "Platform administration"}
      hint={rtl ? "إدارة كتالوج الباقات والأسعار وحدود الاستخدام المعتمدة." : "Manage the plan catalogue, market pricing, and configured usage limits."}
    />
    {error ? <Panel className="mb-4 p-4"><p className="text-sm text-danger">{error === "FORBIDDEN" ? t("err.FORBIDDEN") : error}</p></Panel> : null}
    {loading && !data ? <Panel className="p-4 text-sm text-muted">{t("common.loading")}</Panel> : null}
    {data ? <>
      <Panel className="mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">{rtl ? "صلاحية المنصة" : "Platform role"}</h2>
            <p className="mt-1 text-xs text-muted">{rtl ? "يمكن للدعم والعمليات القراءة؛ تعديل الخطط والأسعار محصور في المدير الأعلى." : "Support and operations can read. Only super administrators can change plans and prices."}</p>
          </div>
          <Badge tone={data.role === "super_admin" ? "good" : "info"}>{data.role}</Badge>
        </div>
      </Panel>

      <div className="mb-3 flex items-center justify-between gap-3">
        <div><h2 className="font-semibold">{rtl ? "الباقات وحدود الاستخدام" : "Plans and entitlements"}</h2><p className="mt-1 text-xs text-muted">{rtl ? "القيم هنا هي مصدر الحدود التي يفرضها الخادم على إنشاء الموارد." : "These values drive server-side limits for resource creation."}</p></div>
        <Badge>{plans.length} {rtl ? "باقات" : "plans"}</Badge>
      </div>
      <div className="mb-5 grid gap-3 lg:grid-cols-2">
        {plans.map((plan) => <Panel key={plan.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h3 className="font-semibold">{rtl ? plan.nameAr : plan.nameEn}</h3><p className="mt-1 text-xs text-muted">{plan.code} · {plan.description}</p></div>
            <div className="flex gap-1"><Badge tone={plan.isActive ? "good" : "neutral"}>{plan.isActive ? (rtl ? "نشطة" : "Active") : (rtl ? "موقوفة" : "Inactive")}</Badge><Badge tone={plan.isPublic ? "info" : "neutral"}>{plan.isPublic ? (rtl ? "عامة" : "Public") : (rtl ? "داخلية" : "Private")}</Badge></div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-surface-2 p-3"><p className="text-xs text-muted">{rtl ? "حدود الاستخدام" : "Limits"}</p><pre className="mt-1 overflow-auto text-xs">{JSON.stringify(objectValue(plan.limits), null, 2)}</pre></div>
            <div className="rounded-lg bg-surface-2 p-3"><p className="text-xs text-muted">{rtl ? "المزايا" : "Features"}</p><pre className="mt-1 overflow-auto text-xs">{JSON.stringify(objectValue(plan.features), null, 2)}</pre></div>
          </div>
          {canWrite ? <Button className="mt-3" variant="quiet" onClick={() => openPlan(plan)}>{rtl ? "تعديل الباقة" : "Edit plan"}</Button> : null}
        </Panel>)}
      </div>

      <Panel className="mb-5 p-4">
        <div className="mb-3"><h2 className="font-semibold">{rtl ? "أسعار الباقات حسب السوق" : "Country-specific prices"}</h2><p className="mt-1 text-xs text-muted">{rtl ? "أدخل الأسعار بوحدات العملة الكاملة، وسيحوّلها الخادم إلى أصغر وحدة نقدية وفق العملة." : "Enter full currency amounts; the server converts them to ISO minor units."}</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={rtl ? "الباقة" : "Plan"}><SelectInput value={price.planId} onChange={(event) => setPrice({ ...price, planId: event.target.value })}><option value="">{rtl ? "اختر باقة" : "Select a plan"}</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.code} — {rtl ? plan.nameAr : plan.nameEn}</option>)}</SelectInput></Field>
          <Field label={rtl ? "الدولة" : "Country"}><SelectInput value={price.countryCode} onChange={(event) => { const entry = COUNTRIES.find((country) => country[0] === event.target.value); setPrice({ ...price, countryCode: event.target.value, currency: entry?.[2] ?? price.currency }); }}>{COUNTRIES.map((country) => <option key={country[0]} value={country[0]}>{rtl ? country[1] : `${country[0]} (${country[2]})`}</option>)}</SelectInput></Field>
          <Field label={rtl ? "العملة" : "Currency"}><TextInput maxLength={3} value={price.currency} onChange={(event) => setPrice({ ...price, currency: event.target.value.toUpperCase() })} /></Field>
          <Field label={rtl ? "السعر الشهري" : "Monthly amount"}><TextInput inputMode="decimal" placeholder="250.00" value={price.monthlyAmount} onChange={(event) => setPrice({ ...price, monthlyAmount: event.target.value })} /></Field>
          <Field label={rtl ? "السعر السنوي" : "Annual amount"}><TextInput inputMode="decimal" placeholder="2500.00" value={price.annualAmount} onChange={(event) => setPrice({ ...price, annualAmount: event.target.value })} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={price.active} onChange={(event) => setPrice({ ...price, active: event.target.checked })} />{rtl ? "سعر معتمد ونشط" : "Active market price"}</label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">{canWrite ? <Button disabled={busy || !price.planId || !price.monthlyAmount || !price.annualAmount} onClick={() => void savePrice()}>{rtl ? "حفظ السعر" : "Save market price"}</Button> : null}{message ? <p role="status" className="text-sm text-danger">{message}</p> : null}</div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-start text-sm"><thead><tr className="border-b border-line text-xs text-muted"><th className="p-2">{rtl ? "الباقة" : "Plan"}</th><th className="p-2">{rtl ? "الدولة" : "Country"}</th><th className="p-2">{rtl ? "شهري" : "Monthly"}</th><th className="p-2">{rtl ? "سنوي" : "Annual"}</th><th className="p-2">{rtl ? "الحالة" : "Status"}</th></tr></thead><tbody>{prices.map((item) => <tr key={item.id} className="border-b border-line"><td className="p-2">{item.planCode}</td><td className="p-2">{item.countryCode} / {item.currency}</td><td className="p-2">{money(item.monthlyPriceMinor, item.currency, lang)}</td><td className="p-2">{money(item.annualPriceMinor, item.currency, lang)}</td><td className="p-2"><Badge tone={item.active ? "good" : "neutral"}>{item.active ? (rtl ? "نشط" : "Active") : (rtl ? "موقوف" : "Inactive")}</Badge></td></tr>)}{prices.length === 0 ? <tr><td colSpan={5} className="p-3 text-center text-xs text-muted">{rtl ? "لم تُضف أسعار بعد." : "No market prices configured yet."}</td></tr> : null}</tbody></table>
        </div>
      </Panel>

      <Panel className="p-4">
        <h2 className="font-semibold">{rtl ? "سجل تغييرات المنصة" : "Platform change log"}</h2>
        <div className="mt-3 divide-y divide-line">{(data.recentAudit ?? []).map((entry, index) => <div key={`${entry.createdAt}-${index}`} className="flex flex-wrap items-center gap-2 py-2 text-xs"><Badge>{entry.action}</Badge><strong>{entry.entity}</strong><span className="text-muted">{entry.entityId}</span><span className="ms-auto text-muted">{date(entry.createdAt, lang)}</span></div>)}{!data.recentAudit?.length ? <p className="py-3 text-sm text-muted">{rtl ? "لا توجد تغييرات مسجلة بعد." : "No platform changes recorded yet."}</p> : null}</div>
      </Panel>
    </> : null}

    <Modal open={editOpen} title={rtl ? "تعديل الباقة" : "Edit plan"} onClose={() => setEditOpen(false)} wide>
      {draft ? <div className="space-y-3">
        <Field label={rtl ? "الوصف" : "Description"}><TextInput value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
        <Field label={rtl ? "ترتيب العرض" : "Sort order"}><TextInput inputMode="numeric" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.isPublic} onChange={(event) => setDraft({ ...draft, isPublic: event.target.checked })} />{rtl ? "عرض الباقة للعملاء" : "Public plan"}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />{rtl ? "تفعيل الباقة" : "Active plan"}</label>
        <Field label={rtl ? "الحدود بصيغة JSON (أعداد صحيحة)" : "Limits JSON (non-negative integers)"}><TextArea rows={7} value={draft.limits} onChange={(event) => setDraft({ ...draft, limits: event.target.value })} /></Field>
        <Field label={rtl ? "المزايا بصيغة JSON" : "Features JSON"}><TextArea rows={6} value={draft.features} onChange={(event) => setDraft({ ...draft, features: event.target.value })} /></Field>
        {message ? <p role="alert" className="text-sm text-danger">{message}</p> : null}
        <div className="flex justify-end gap-2"><Button variant="quiet" onClick={() => setEditOpen(false)}>{t("common.cancel")}</Button><Button disabled={busy} onClick={() => void savePlan()}>{t("common.save")}</Button></div>
      </div> : null}
    </Modal>
  </>;
}
