import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell, useApp } from "@/components/shell";
import { CatalogScreen, TextField, nameOf, str, takeIntent } from "@/components/work";

export const Route = createFileRoute("/suppliers")({ component: Page });

function Page() {
  return (
    <Shell>
      <Suppliers />
    </Shell>
  );
}

function Suppliers() {
  const { t, lang, allowed } = useApp();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (takeIntent() === "new") setTick(1);
  }, []);
  return (
    <CatalogScreen
      key={tick}
      kind="suppliers"
      title={t("nav.suppliers")}
      write={allowed("partners.write")}
      blank={() => ({ code: "", nameAr: "", nameEn: "", company: "", contact: "", phone: "", email: "", city: "", country: "", taxId: "", paymentTerms: "", currency: "", notes: "", active: true })}
      columns={[
        { key: "code", label: t("common.code") },
        { key: "nameAr", label: t("common.nameAr"), render: (row) => nameOf(row, lang) },
        { key: "phone", label: t("common.phone") },
        { key: "city", label: t("common.city") },
      ]}
      fields={(draft, set) => (
        <>
          <TextField label={t("common.code")} value={String(draft.code ?? "")} onChange={(value) => set("code", value)} />
          <TextField label={t("common.nameAr")} value={String(draft.nameAr ?? "")} onChange={(value) => set("nameAr", value)} />
          <TextField label={t("common.nameEn")} value={String(draft.nameEn ?? "")} onChange={(value) => set("nameEn", value)} />
          <TextField label={t("common.company")} value={String(draft.company ?? "")} onChange={(value) => set("company", value)} />
          <TextField label={t("common.contact")} value={String(draft.contact ?? "")} onChange={(value) => set("contact", value)} />
          <TextField label={t("common.phone")} value={String(draft.phone ?? "")} onChange={(value) => set("phone", value)} />
          <TextField label={t("common.email")} value={String(draft.email ?? "")} onChange={(value) => set("email", value)} />
          <TextField label={t("common.city")} value={String(draft.city ?? "")} onChange={(value) => set("city", value)} />
          <TextField label={t("common.country")} value={String(draft.country ?? "")} onChange={(value) => set("country", value)} />
          <TextField label={t("common.taxId")} value={String(draft.taxId ?? "")} onChange={(value) => set("taxId", value)} />
          <TextField label={t("common.terms")} value={String(draft.paymentTerms ?? "")} onChange={(value) => set("paymentTerms", value)} />
          <TextField label={t("onboard.currency")} value={String(draft.currency ?? "")} onChange={(value) => set("currency", value)} />
          <TextField label={t("common.notes")} value={String(draft.notes ?? "")} onChange={(value) => set("notes", value)} type="area" />
        </>
      )}
    />
  );
}

void str;
