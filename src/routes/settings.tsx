import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, useApp } from "@/components/shell";
import { Button, Field, PageHead, Panel, SelectInput, TextInput } from "@/components/ui";
import { updateOrganization } from "@/lib/stock/api";
import { Banner } from "@/components/work";

export const Route = createFileRoute("/settings")({ component: Page });
function Page() { return <Shell><Settings /></Shell>; }
function Settings() {
  const { org, t, lang, allowed, reload } = useApp();
  const [name, setName] = useState(org.name); const [currency, setCurrency] = useState(org.currency); const [taxRate, setTaxRate] = useState(String(org.taxRate));
  const [allowNegative, setAllowNegative] = useState(org.allowNegative); const [expiryWarnDays, setExpiryWarnDays] = useState(String(org.expiryWarnDays)); const [slowDays, setSlowDays] = useState(String(org.slowDays));
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const rtl = lang === "ar";
  async function save() {
    setBusy(true); setMessage("");
    try { const result = await updateOrganization({ data: { orgId: org.id, name, currency, taxRate: Number(taxRate), allowNegative, expiryWarnDays: Number(expiryWarnDays), slowDays: Number(slowDays) } }); if (result.ok) { setMessage(rtl ? "تم حفظ الإعدادات." : "Settings saved."); reload(); } else setMessage(t(`err.${result.error}`)); }
    catch { setMessage(t("err.VALIDATION")); } finally { setBusy(false); }
  }
  return <>
    <PageHead crumb={`${org.name} / ${t("nav.settings")}`} title={t("nav.settings")} hint={rtl ? "اضبط سياسات المخزون والبيانات الأساسية للمؤسسة." : "Configure organization details and inventory policies."} />
    {!allowed("settings.write") ? <Panel className="p-4 text-sm text-muted">{t("err.FORBIDDEN")}</Panel> : <>
      <Panel className="mb-4 p-4"><h2 className="mb-3 text-sm font-semibold">{rtl ? "بيانات المؤسسة" : "Organization details"}</h2><div className="grid gap-3 sm:grid-cols-2"><Field label={rtl ? "اسم المؤسسة" : "Organization name"}><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label={rtl ? "العملة" : "Currency"}><SelectInput value={currency} onChange={(e) => setCurrency(e.target.value)}>{["EGP","SAR","AED","USD","EUR","GBP","KWD","QAR","MAD","JOD"].map((v) => <option key={v}>{v}</option>)}</SelectInput></Field></div></Panel>
      <Panel className="mb-4 p-4"><h2 className="mb-3 text-sm font-semibold">{rtl ? "سياسات المخزون" : "Inventory policies"}</h2><div className="grid gap-3 sm:grid-cols-2"><Field label={t("set.tax")}><TextInput type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></Field><Field label={t("set.expiryDays")}><TextInput type="number" min="0" max="3650" value={expiryWarnDays} onChange={(e) => setExpiryWarnDays(e.target.value)} /></Field><Field label={t("set.slowDays")}><TextInput type="number" min="1" max="3650" value={slowDays} onChange={(e) => setSlowDays(e.target.value)} /></Field></div><label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={allowNegative} onChange={(e) => setAllowNegative(e.target.checked)} className="mt-1 accent-teal" /><span><span className="font-medium">{t("set.negative")}</span><span className="block text-xs text-muted">{t("set.negativeHint")}</span></span></label></Panel>
      {message ? <p role="status" className="mb-3 text-sm text-teal">{message}</p> : null}<Button disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? (rtl ? "جارٍ الحفظ..." : "Saving...") : (rtl ? "حفظ التغييرات" : "Save changes")}</Button>
    </>}
  </>;
}
