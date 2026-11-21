import { createFileRoute } from "@tanstack/react-router";
import { Shell, useApp } from "@/components/shell";
import { CatalogScreen, TextField, nameOf, str, type Row } from "@/components/work";
import { SelectInput } from "@/components/ui";

export const Route = createFileRoute("/categories")({ component: Page });

function Page() {
  return (
    <Shell>
      <Categories />
    </Shell>
  );
}

function Categories() {
  const { t, lang, allowed } = useApp();
  return (
    <CatalogScreen
      kind="categories"
      title={t("nav.categories")}
      write={allowed("products.write")}
      blank={() => ({ nameAr: "", nameEn: "", description: "", parentId: "", active: true })}
      columns={[
        { key: "nameAr", label: t("common.nameAr"), render: (row) => nameOf(row, lang) },
        { key: "nameEn", label: t("common.nameEn") },
        { key: "productCount", label: t("dash.skus") },
        { key: "active", label: t("common.status"), render: (row) => (row.active === false ? t("common.archived") : t("common.active")) },
      ]}
      fields={(draft, set, rows) => (
        <>
          <TextField label={t("common.nameAr")} value={String(draft.nameAr ?? "")} onChange={(value) => set("nameAr", value)} />
          <TextField label={t("common.nameEn")} value={String(draft.nameEn ?? "")} onChange={(value) => set("nameEn", value)} />
          <TextField label={t("common.description")} value={String(draft.description ?? "")} onChange={(value) => set("description", value)} type="area" />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{t("common.parent")}</span>
            <SelectInput value={String(draft.parentId ?? "")} onChange={(event) => set("parentId", event.target.value)}>
              <option value="">{t("common.none")}</option>
              {rows.filter((row) => str(row, "id") !== String(draft.id ?? "")).map((row: Row) => (
                <option key={str(row, "id")} value={str(row, "id")}>{nameOf(row, lang)}</option>
              ))}
            </SelectInput>
          </label>
        </>
      )}
    />
  );
}
