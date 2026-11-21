import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, ShieldCheck } from "lucide-react";
import { Shell, useApp } from "@/components/shell";
import { Badge, PageHead, Panel } from "@/components/ui";
import { getSubscriptionOverview } from "@/lib/stock/api";
import { Banner, useSnap } from "@/components/work";

type Plan = {
  code: string; nameAr: string; nameEn: string; description: string; currency: string;
  monthlyPriceMinor: string | null; annualPriceMinor: string | null; limits: unknown; features: unknown;
};
type Overview = {
  countryCode: string; currency: string;
  subscription: null | { status: string; billingCycle: string; trialEndsAt: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; planCode: string; planNameAr: string; planNameEn: string };
  plans: Plan[]; usage: { products: number; warehouses: number; branches: number; members: number };
};

export const Route = createFileRoute("/subscription")({ component: Page });
function Page() { return <Shell><Subscription /></Shell>; }

function money(minor: string | null, currency: string, lang: string) {
  if (minor === null) return null;
  const numeric = Number(minor);
  if (!Number.isFinite(numeric)) return null;
  try {
    const options = { style: "currency" as const, currency };
    const fractionDigits = new Intl.NumberFormat("en", options).resolvedOptions().maximumFractionDigits;
    const amount = numeric / (10 ** fractionDigits);
    return new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en", options).format(amount);
  } catch {
    return null;
  }
}
function date(value: string | null, lang: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en", { dateStyle: "medium" }).format(parsed);
}

function Subscription() {
  const { org, lang, t, allowed } = useApp();
  const rtl = lang === "ar";
  const canManage = allowed("settings.write");
  const snap = useSnap<Overview>(`saas-overview:${org.id}`, () => getSubscriptionOverview({ data: { orgId: org.id } }), [org.id]);
  const sub = snap.data?.subscription;
  return <>
    <PageHead crumb={`${org.name} / ${t("nav.subscription")}`} title={t("nav.subscription")} hint={rtl ? "حالة الاشتراك والباقات المتاحة للمؤسسة." : "Your organization subscription and available plans."} />
    {!canManage ? <Panel className="p-4 text-sm text-muted">{t("err.FORBIDDEN")}</Panel> : <>
      <Banner code={snap.error} local={snap.local} />
      {snap.data ? <>
        <Panel className="mb-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-teal-soft p-2 text-teal"><CreditCard className="h-5 w-5" /></div>
              <div>
                <h2 className="text-sm font-semibold">{rtl ? "الاشتراك الحالي" : "Current subscription"}</h2>
                <p className="mt-1 text-lg font-semibold">{rtl ? (sub?.planNameAr ?? "لا يوجد اشتراك") : (sub?.planNameEn ?? "No subscription")}</p>
                <p className="mt-1 text-xs text-muted">{rtl ? "الدولة" : "Country"}: {snap.data.countryCode} · {rtl ? "العملة" : "Currency"}: {snap.data.currency}</p>
              </div>
            </div>
            <Badge tone={sub?.status === "active" ? "good" : sub?.status === "trialing" ? "info" : "warn"}>{sub?.status ?? "—"}</Badge>
          </div>
          {sub ? <div className="mt-4 grid gap-3 border-t border-line pt-3 sm:grid-cols-3">
            <div><p className="text-xs text-muted">{rtl ? "دورة الفوترة" : "Billing cycle"}</p><p className="mt-1 text-sm font-medium">{sub.billingCycle}</p></div>
            <div><p className="text-xs text-muted">{rtl ? "نهاية التجربة" : "Trial ends"}</p><p className="mt-1 text-sm font-medium">{date(sub.trialEndsAt, lang)}</p></div>
            <div><p className="text-xs text-muted">{rtl ? "نهاية الفترة الحالية" : "Current period ends"}</p><p className="mt-1 text-sm font-medium">{date(sub.currentPeriodEnd, lang)}</p></div>
          </div> : null}
        </Panel>
        <Panel className="mb-4 p-4">
          <div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-teal" /><h2 className="text-sm font-semibold">{rtl ? "الاستخدام الحالي" : "Current usage"}</h2></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[[rtl ? "الأصناف النشطة" : "Active products", snap.data.usage.products], [rtl ? "المخازن النشطة" : "Active warehouses", snap.data.usage.warehouses], [rtl ? "الفروع النشطة" : "Active branches", snap.data.usage.branches], [rtl ? "الأعضاء" : "Members", snap.data.usage.members]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-surface-2 p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>)}
          </div>
        </Panel>
        <div className="mb-3"><h2 className="text-sm font-semibold">{rtl ? "الباقات المتاحة" : "Available plans"}</h2><p className="mt-1 text-xs text-muted">{rtl ? "الأسعار والحدود لا تظهر إلا بعد إعدادها واعتمادها لهذه الدولة والعملة." : "Prices and limits appear only after they are configured for this country and currency."}</p></div>
        <div className="grid gap-3 lg:grid-cols-3">
          {snap.data.plans.map((plan) => {
            const monthly = money(plan.monthlyPriceMinor, plan.currency, lang);
            const annual = money(plan.annualPriceMinor, plan.currency, lang);
            const active = sub?.planCode === plan.code;
            return <Panel key={plan.code} className="p-4">
              <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{rtl ? plan.nameAr : plan.nameEn}</h3>{active ? <Badge tone="good">{rtl ? "باقتك الحالية" : "Current plan"}</Badge> : null}</div>
              <p className="mt-2 min-h-10 text-xs leading-5 text-muted">{plan.description}</p>
              <div className="mt-3 space-y-2 border-t border-line pt-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-muted">{rtl ? "شهريًا" : "Monthly"}</span><strong>{monthly ?? (rtl ? "لم يحدد بعد" : "Not configured")}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted">{rtl ? "سنويًا" : "Annually"}</span><strong>{annual ?? (rtl ? "لم يحدد بعد" : "Not configured")}</strong></div>
              </div>
              <p className="mt-3 text-xs text-muted">{rtl ? "حدود ومزايا الباقة" : "Plan limits and features"}: {plan.limits && Object.keys(plan.limits as object).length ? JSON.stringify(plan.limits) : (rtl ? "لم تعتمد بعد" : "Not configured")}</p>
            </Panel>;
          })}
        </div>
        <p className="mt-4 rounded-lg border border-line p-3 text-xs leading-5 text-muted">{rtl ? "تفعيل تغيير الباقة والدفع الإلكتروني مؤجل حتى ربط مزود دفع حقيقي وإعداد الأسعار والحدود. هذه الصفحة تعرض البيانات الفعلية الموجودة فقط ولا تنفذ تحصيلًا وهميًا." : "Plan changes and online payment remain disabled until a real payment provider, prices, and limits are configured. This page shows stored data only and never simulates a payment."}</p>
      </> : null}
    </>}
  </>;
}
