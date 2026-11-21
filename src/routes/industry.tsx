import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, useApp } from "@/components/shell";
import { Button, PageHead, Panel, SelectInput } from "@/components/ui";
import { updateOrganization } from "@/lib/stock/api";
import { INDUSTRIES } from "@/lib/stock/industries";

export const Route = createFileRoute("/industry")({ component: Page });
function Page() { return <Shell><Industry /></Shell>; }
function Industry() {
  const { org, t, lang, allowed, reload } = useApp();
  const [industry, setIndustry] = useState(org.industry); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const rtl = lang === "ar";
  async function save() {
    setBusy(true); setMessage("");
    try { const result = await updateOrganization({ data: { orgId: org.id, industry } }); if (result.ok) { setMessage(rtl ? "تم تحديث ملف النشاط والحقول المرتبطة به." : "Industry profile and related custom fields updated."); reload(); } else setMessage(t(`err.${result.error}`)); }
    catch { setMessage(t("err.VALIDATION")); } finally { setBusy(false); }
  }
  const descriptions: Record<string, string> = {
    general: rtl ? "إدارة مخزون عامة تناسب الأنشطة المتنوعة." : "A flexible profile for general inventory operations.",
    retail: rtl ? "بيع التجزئة وإدارة الأصناف وسرعة دورانها." : "Retail assortment and stock turnover.",
    wholesale: rtl ? "إدارة الجملة والتوزيع والموردين." : "Wholesale distribution and supplier operations.",
    restaurant: rtl ? "مكونات ووصفات ومتابعة الصلاحية." : "Ingredients, recipes and expiry tracking.",
    pharmacy: rtl ? "حقول إضافية للمادة الفعالة والشكل الدوائي والتخزين." : "Additional active ingredient, dosage form and storage fields.",
    manufacturing: rtl ? "إنتاج ومكونات ووصفات تشغيلية." : "Production, components and operational recipes.",
    equipment: rtl ? "الموديل والضمان وحالة المعدات." : "Equipment model, warranty and condition.",
    construction: rtl ? "مواد ومستلزمات مرتبطة بالمشروعات والمواقع." : "Materials and supplies for projects and sites.",
    importexport: rtl ? "عمليات الاستيراد والتصدير وإدارة المخزون." : "Import/export and inventory operations.",
  };
  return <>
    <PageHead crumb={`${org.name} / ${t("nav.industry")}`} title={t("nav.industry")} hint={rtl ? "خصص تجربة المنصة حسب طبيعة نشاطك دون تغيير محرك المخزون الأساسي." : "Adapt the workspace to your business without changing the core inventory engine."} />
    {!allowed("settings.write") ? <Panel className="p-4 text-sm text-muted">{t("err.FORBIDDEN")}</Panel> : <Panel className="max-w-2xl p-4"><div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-teal-soft text-2xl">🏭</div><h2 className="text-base font-semibold">{rtl ? "نوع النشاط" : "Business type"}</h2><p className="mt-1 text-sm text-muted">{descriptions[industry] ?? descriptions.general}</p><SelectInput className="mt-4" value={industry} onChange={(e) => setIndustry(e.target.value)}>{INDUSTRIES.map((v) => <option key={v} value={v}>{t(`industry.${v}`)}</option>)}</SelectInput><p className="mt-3 text-xs text-muted">{rtl ? "قد يضيف تغيير النشاط حقولًا مخصصة للمنتجات. لا يحذف البيانات التاريخية." : "Changing the profile may add product custom fields. Historical data is not deleted."}</p>{message ? <p role="status" className="mt-3 text-sm text-teal">{message}</p> : null}<Button className="mt-4" disabled={busy || industry === org.industry} onClick={() => void save()}>{busy ? (rtl ? "جارٍ الحفظ..." : "Saving...") : (rtl ? "حفظ ملف النشاط" : "Save industry profile")}</Button></Panel>}
  </>;
}
