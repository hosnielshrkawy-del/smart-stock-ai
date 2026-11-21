import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, errText, useApp } from "@/components/shell";
import { Badge, Button, Field, Modal, PageHead, Panel, TextInput } from "@/components/ui";
import { saveSimple } from "@/lib/stock/api";
import { Banner, Grid, settle, str, useCatalog } from "@/components/work";

export const Route = createFileRoute("/branches")({ component: Page });

function Page() {
  return <Shell><Branches /></Shell>;
}

const blank = () => ({ code: "", nameAr: "", nameEn: "", address: "", city: "", phone: "", active: true, isDefault: false });

function Branches() {
  const { org, lang, t, allowed } = useApp();
  const snap = useCatalog("branches");
  const [draft, setDraft] = useState<Record<string, string | boolean>>(blank());
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const rtl = lang === "ar";
  const write = allowed("settings.write");
  const set = (key: string, value: string | boolean) => setDraft((current) => ({ ...current, [key]: value }));

  async function save() {
    if (!String(draft.code ?? "").trim() || !String(draft.nameAr ?? "").trim()) {
      setMessage(rtl ? "أدخل رمز الفرع واسمه بالعربية." : "Enter a branch code and Arabic name.");
      return;
    }
    setBusy(true);
    setMessage("");
    const result = await settle(() => saveSimple({ data: { orgId: org.id, kind: "branches", row: draft } }));
    setBusy(false);
    if (result) {
      setMessage(errText(t, result));
      return;
    }
    setOpen(false);
    snap.reload();
  }

  const rows = snap.data ?? [];
  return <>
    <PageHead
      crumb={`${org.name} / ${t("nav.branches")}`}
      title={t("nav.branches")}
      hint={rtl ? "نظّم الفروع واربط كل مخزن بالفرع التابع له." : "Manage branches and assign each warehouse to its branch."}
      actions={write ? <Button onClick={() => { setDraft(blank()); setMessage(""); setOpen(true); }}>{t("common.create")}</Button> : null}
    />
    <Banner code={snap.error} local={snap.local} />
    <Panel>
      <Grid
        rows={rows}
        columns={[
          { key: "code", label: t("common.code") },
          { key: "nameAr", label: t("common.nameAr") },
          { key: "city", label: t("common.city") },
          { key: "warehouseCount", label: rtl ? "عدد المخازن" : "Warehouses" },
          { key: "isDefault", label: rtl ? "الفرع الرئيسي" : "Default", render: (row) => row.isDefault ? <Badge tone="good">{rtl ? "رئيسي" : "Default"}</Badge> : "—" },
          { key: "active", label: t("common.status"), render: (row) => <Badge tone={row.active ? "good" : "neutral"}>{row.active ? t("common.active") : t("common.archived")}</Badge> },
          ...(write ? [{ key: "edit", label: t("common.actions"), render: (row: Record<string, unknown>) => <Button variant="quiet" className="h-8" onClick={() => { setDraft({ ...blank(), ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "boolean" ? value : value == null ? "" : String(value)])) }); setMessage(""); setOpen(true); }}>{t("common.edit")}</Button> }] : []),
        ]}
      />
    </Panel>
    <Modal open={open} title={rtl ? "بيانات الفرع" : "Branch details"} onClose={() => setOpen(false)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("common.code")}><TextInput value={String(draft.code ?? "")} onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
        <Field label={t("common.nameAr")}><TextInput value={String(draft.nameAr ?? "")} onChange={(e) => set("nameAr", e.target.value)} /></Field>
        <Field label={t("common.nameEn")}><TextInput value={String(draft.nameEn ?? "")} onChange={(e) => set("nameEn", e.target.value)} /></Field>
        <Field label={t("common.city")}><TextInput value={String(draft.city ?? "")} onChange={(e) => set("city", e.target.value)} /></Field>
        <Field label={t("common.phone")}><TextInput value={String(draft.phone ?? "")} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label={t("common.address")}><TextInput value={String(draft.address ?? "")} onChange={(e) => set("address", e.target.value)} /></Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(draft.isDefault)} onChange={(e) => set("isDefault", e.target.checked)} />{rtl ? "تعيين كفرع رئيسي" : "Set as default branch"}</label>
      <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active !== false} onChange={(e) => set("active", e.target.checked)} />{rtl ? "فرع نشط" : "Active branch"}</label>
      {message ? <p className="mt-3 text-sm text-danger">{message}</p> : null}
      <div className="mt-4 flex justify-end gap-2"><Button variant="quiet" onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button disabled={busy} onClick={() => void save()}>{t("common.save")}</Button></div>
    </Modal>
    <p className="mt-3 text-xs text-muted">{rtl ? "لا يمكن إيقاف الفرع الرئيسي أو إيقاف فرع ما زالت به مخازن نشطة. انقل المخازن أولًا." : "The default branch cannot be disabled. Move active warehouses before disabling a branch."}</p>
  </>;
}
