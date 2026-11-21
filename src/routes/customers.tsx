import { createFileRoute } from "@tanstack/react-router";
import { Shell, useApp } from "@/components/shell";
import { SelectInput } from "@/components/ui";
import { CatalogScreen, TextField, nameOf } from "@/components/work";

export const Route = createFileRoute("/customers")({ component: Page });

function Page() {
  return (
    <Shell>
      <Customers />
    </Shell>
  );
}

const KINDS = ["customer", "department", "project", "site", "beneficiary"];

function Customers() {
  const { t, lang, allowed, org } = useApp();
  const title = org.industry === "construction" ? t("nav.customersProject") : t("nav.customers");
  return (
    <CatalogScreen
      kind="customers"
      title={title}
      write={allowed("partners.write")}
      blank={() => ({ code: "", kind: org.industry === "construction" ? "project" : "customer", nameAr: "", nameEn: "", contact: "", phone: "", email: "", address: "", notes: "", active: true })}
      columns={[
        { key: "code", label: t("common.code") },
        { key: "nameAr", label: t("common.nameAr"), render: (row) => nameOf(row, lang) },
        { key: "kind", label: t("common.status"), render: (row) => t(`kind.${String(row.kind ?? "customer")}`) },
        { key: "phone", label: t("common.phone") },
      ]}
      fields={(draft, set) => (
        <>
          <TextField label={t("common.code")} value={String(draft.code ?? "")} onChange={(value) => set("code", value)} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{t("common.partner")}</span>
            <SelectInput value={String(draft.kind ?? "customer")} onChange={(event) => set("kind", event.target.value)}>
              {KINDS.map((kind) => <option key={kind} value={kind}>{t(`kind.${kind}`)}</option>)}
            </SelectInput>
          </label>
          <TextField label={t("common.nameAr")} value={String(draft.nameAr ?? "")} onChange={(value) => set("nameAr", value)} />
          <TextField label={t("common.nameEn")} value={String(draft.nameEn ?? "")} onChange={(value) => set("nameEn", value)} />
          <TextField label={t("common.contact")} value={String(draft.contact ?? "")} onChange={(value) => set("contact", value)} />
          <TextField label={t("common.phone")} value={String(draft.phone ?? "")} onChange={(value) => set("phone", value)} />
          <TextField label={t("common.email")} value={String(draft.email ?? "")} onChange={(value) => set("email", value)} />
          <TextField label={t("common.address")} value={String(draft.address ?? "")} onChange={(value) => set("address", value)} />
          <TextField label={t("common.notes")} value={String(draft.notes ?? "")} onChange={(value) => set("notes", value)} type="area" />
        </>
      )}
    />
  );
}
