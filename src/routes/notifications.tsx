import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCheck, CircleAlert } from "lucide-react";
import { Shell, useApp } from "@/components/shell";
import { Badge, Button, PageHead, Panel } from "@/components/ui";
import { listAlerts, setAlertState } from "@/lib/stock/api";
import { Banner, useSnap } from "@/components/work";

export const Route = createFileRoute("/notifications")({ component: Page });
function Page() { return <Shell><Notifications /></Shell>; }
function Notifications() {
  const { org, t, lang } = useApp();
  const snap = useSnap(`alerts:${org.id}`, () => listAlerts({ data: { orgId: org.id } }), [org.id]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const rtl = lang === "ar";
  const labels: Record<string, string> = {
    low: rtl ? "وصل إلى حد إعادة الطلب" : "At reorder point",
    out: rtl ? "نفد المخزون" : "Out of stock",
    expiring: rtl ? "قارب على الانتهاء" : "Expiring soon",
    expired: rtl ? "منتهي الصلاحية" : "Expired",
    po: rtl ? "طلب شراء متأخر" : "Late purchase order",
    pending: rtl ? "مسودات معلقة" : "Pending drafts",
  };
  async function update(key: string, status: string) {
    setBusy(key); setError("");
    try {
      const result = await setAlertState({ data: { orgId: org.id, key, status } });
      if (result.ok) snap.reload(); else setError(t(`err.${result.error}`));
    } catch { setError(t("err.VALIDATION")); }
    finally { setBusy(""); }
  }
  return <>
    <PageHead crumb={`${org.name} / ${t("nav.notifications")}`} title={t("nav.notifications")} hint={rtl ? "تابع المخاطر التشغيلية واتخذ إجراءً موثقًا." : "Track operational risks and record follow-up actions."} actions={<Button variant="quiet" onClick={() => snap.reload()}>{rtl ? "تحديث" : "Refresh"}</Button>} />
    <Banner code={snap.error} local={snap.local} />
    {error ? <p role="alert" className="mb-3 text-sm text-danger">{error}</p> : null}
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[
        [rtl ? "مفتوحة" : "Open", (snap.data ?? []).filter((a) => a.status === "open").length],
        [rtl ? "عالية الخطورة" : "High severity", (snap.data ?? []).filter((a) => a.severity === "high").length],
        [rtl ? "متوسطة" : "Medium", (snap.data ?? []).filter((a) => a.severity === "medium").length],
        [rtl ? "قيد المتابعة" : "Acknowledged", (snap.data ?? []).filter((a) => a.status === "acked").length],
      ].map(([label, value]) => <Panel key={String(label)} className="p-3"><div className="text-xs text-muted">{label}</div><div className="num mt-1 text-xl font-semibold">{value}</div></Panel>)}
    </div>
    <Panel className="overflow-hidden">
      {(snap.data ?? []).length === 0 ? <div className="p-10 text-center"><CheckCheck className="mx-auto mb-2 h-8 w-8 text-success" /><p className="text-sm font-medium">{rtl ? "لا توجد تنبيهات مفتوحة" : "No open alerts"}</p><p className="mt-1 text-xs text-muted">{rtl ? "الوضع التشغيلي يبدو هادئًا حاليًا." : "There are no current operational alerts."}</p></div> :
        <div className="divide-y divide-line">{(snap.data ?? []).map((alert) => <div key={alert.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${alert.severity === "high" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}`}><CircleAlert className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-sm font-medium"><span>{alert.title}</span><Badge tone={alert.severity === "high" ? "bad" : "warn"}>{labels[alert.kind] ?? alert.kind}</Badge></div><div className="mt-1 text-xs text-muted">{alert.detail || (rtl ? "يتطلب مراجعة" : "Needs review")}</div></div>
          <div className="flex items-center gap-2">{alert.status === "open" ? <Button className="h-8" disabled={busy === alert.key} onClick={() => void update(alert.key, "acked")}>{rtl ? "بدء المتابعة" : "Acknowledge"}</Button> : <Badge tone="info">{rtl ? "قيد المتابعة" : "Acknowledged"}</Badge>}<Button variant="quiet" className="h-8" disabled={busy === alert.key} onClick={() => void update(alert.key, "closed")}>{rtl ? "إغلاق" : "Close"}</Button></div>
        </div>)}</div>}
    </Panel>
  </>;
}
