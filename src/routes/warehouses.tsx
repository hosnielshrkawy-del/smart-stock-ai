import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, GitBranch, MapPin, Warehouse as WarehouseIcon } from "lucide-react";
import { useState } from "react";
import { Shell, errText, useApp } from "@/components/shell";
import { Button, Field, MetricCard, Modal, PageHead, Panel, SelectInput, TextInput } from "@/components/ui";
import { saveSimple } from "@/lib/stock/api";
import { Banner, Grid, TextField, nameOf, settle, str, useCatalog } from "@/components/work";

export const Route = createFileRoute("/warehouses")({ component: Page });

function Page() {
  return (
    <Shell>
      <Warehouses />
    </Shell>
  );
}

const KINDS = ["standard", "cold", "transit", "site", "returns"];

function Warehouses() {
  const { org, lang, t, allowed } = useApp();
  const warehouses = useCatalog("warehouses");
  const branches = useCatalog("branches");
  const locations = useCatalog("locations");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({ code: "", nameAr: "", nameEn: "", kind: "standard", city: "", address: "", phone: "", managerName: "", notes: "", branchId: "" });
  const [focus, setFocus] = useState<string>("");
  const [loc, setLoc] = useState({ code: "", name: "" });
  const [msg, setMsg] = useState("");
  const write = allowed("products.write");
  const save = async () => {
    const code = await settle(() => saveSimple({ data: { orgId: org.id, kind: "warehouses", row: draft } }));
    if (code) setMsg(errText(t, code));
    else {
      setOpen(false);
      warehouses.reload();
    }
  };
  const editWarehouse = (row: Record<string, unknown>) => {
    setDraft({
      id: str(row, "id"), code: str(row, "code"), nameAr: str(row, "nameAr"), nameEn: str(row, "nameEn"),
      kind: str(row, "kind") || "standard", city: str(row, "city"), address: str(row, "address"),
      phone: str(row, "phone"), managerName: str(row, "managerName"), notes: str(row, "notes"),
      branchId: str(row, "branchId"), active: row.active === false ? "false" : "true",
    });
    setMsg("");
    setOpen(true);
  };
  const addLoc = async () => {
    if (!focus || !loc.code || !loc.name) return;
    const code = await settle(() => saveSimple({ data: { orgId: org.id, kind: "locations", row: { warehouseId: focus, code: loc.code, name: loc.name } } }));
    if (code) setMsg(errText(t, code));
    else {
      setLoc({ code: "", name: "" });
      locations.reload();
    }
  };
  const selected = (warehouses.data ?? []).find((row) => str(row, "id") === focus);
  return (
    <>
      <PageHead
        crumb={`${org.name} / ${t("nav.warehouses")}`}
        title={t("nav.warehouses")}
        actions={write ? <Button onClick={() => { setDraft({ code: "", nameAr: "", nameEn: "", kind: "standard", city: "", address: "", phone: "", managerName: "", notes: "", branchId: str((branches.data ?? []).find((row) => row.isDefault) ?? branches.data?.[0], "id") }); setMsg(""); setOpen(true); }}>{t("common.create")}</Button> : null}
      />
      <Banner code={warehouses.error} local={warehouses.local} />
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label={t("nav.warehouses")} value={(warehouses.data ?? []).length} icon={<WarehouseIcon size={19} />} tone="teal" />
        <MetricCard label={t("nav.branches")} value={(branches.data ?? []).length} icon={<GitBranch size={19} />} />
        <MetricCard label={t("wh.locations")} value={(locations.data ?? []).length} icon={<MapPin size={19} />} />
        <MetricCard label={t("common.active")} value={(warehouses.data ?? []).filter((row) => row.active !== false).length} icon={<CheckCircle2 size={19} />} />
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <Grid
            columns={[
              { key: "code", label: t("common.code") },
              { key: "nameAr", label: t("common.nameAr"), render: (row) => nameOf(row, lang) },
              { key: "kind", label: t("wh.kind"), render: (row) => t(`wh.${str(row, "kind")}`) },
              { key: "city", label: t("common.city") },
              { key: "branchNameAr", label: lang === "ar" ? "الفرع" : "Branch" },
              { key: "managerName", label: t("wh.manager") },
              ...(write ? [{ key: "actions", label: t("common.actions"), render: (row: Record<string, unknown>) => <Button variant="quiet" className="h-8" onClick={() => editWarehouse(row)}>{t("common.edit")}</Button> }] : []),
            ]}
            rows={warehouses.data ?? []}
            onRow={(row) => setFocus(str(row, "id"))}
          />
        </Panel>
        <Panel className="p-3 lg:col-span-2">
          {selected ? (
            <>
              <h2 className="text-sm font-semibold">{nameOf(selected, lang)}</h2>
              <p className="mt-1 text-xs text-muted">{str(selected, "address") || str(selected, "city") || t("common.none")}</p>
              <h3 className="mb-2 mt-4 text-xs font-medium text-muted">{t("wh.locations")}</h3>
              <ul className="space-y-1 text-sm">
                {(locations.data ?? []).filter((row) => str(row, "warehouseId") === focus).map((row) => (
                  <li key={str(row, "id")} className="flex justify-between rounded-md bg-surface-2 px-2 py-1">
                    <span>{str(row, "code")}</span>
                    <span className="text-muted">{str(row, "name")}</span>
                  </li>
                ))}
              </ul>
              {write ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <TextInput value={loc.code} placeholder={t("common.code")} onChange={(event) => setLoc({ ...loc, code: event.target.value })} />
                  <TextInput value={loc.name} placeholder={t("wh.locations")} onChange={(event) => setLoc({ ...loc, name: event.target.value })} />
                  <Button className="col-span-2" variant="quiet" onClick={() => void addLoc()}>{t("common.addLine")}</Button>
                </div>
              ) : null}
              {msg ? <p className="mt-2 text-sm text-danger">{msg}</p> : null}
            </>
          ) : (
            <p className="text-sm text-muted">{t("common.empty")}</p>
          )}
        </Panel>
      </div>
      <Modal open={open} title={t("nav.warehouses")} onClose={() => setOpen(false)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={t("common.code")} value={draft.code} onChange={(code) => setDraft({ ...draft, code })} />
          <TextField label={t("common.nameAr")} value={draft.nameAr} onChange={(nameAr) => setDraft({ ...draft, nameAr })} />
          <TextField label={t("common.nameEn")} value={draft.nameEn} onChange={(nameEn) => setDraft({ ...draft, nameEn })} />
          <Field label={t("wh.kind")}>
            <SelectInput value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })}>
              {KINDS.map((kind) => <option key={kind} value={kind}>{t(`wh.${kind}`)}</option>)}
            </SelectInput>
          </Field>
          <Field label={lang === "ar" ? "الفرع" : "Branch"}>
            <SelectInput value={draft.branchId} onChange={(event) => setDraft({ ...draft, branchId: event.target.value })}>
              {(branches.data ?? []).filter((row) => row.active !== false).map((branch) => <option key={str(branch, "id")} value={str(branch, "id")}>{nameOf(branch, lang)}</option>)}
            </SelectInput>
          </Field>
          <TextField label={t("common.city")} value={draft.city} onChange={(city) => setDraft({ ...draft, city })} />
          <TextField label={t("wh.manager")} value={draft.managerName} onChange={(managerName) => setDraft({ ...draft, managerName })} />
          <TextField label={t("common.phone")} value={draft.phone} onChange={(phone) => setDraft({ ...draft, phone })} />
          <TextField label={t("common.address")} value={draft.address} onChange={(address) => setDraft({ ...draft, address })} />
        </div>
        {draft.id ? <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active !== "false"} onChange={(event) => setDraft({ ...draft, active: event.target.checked ? "true" : "false" })} />{t("common.active")}</label> : null}
        {msg ? <p className="mt-2 text-sm text-danger">{msg}</p> : null}
        <div className="mt-4 flex justify-end"><Button onClick={() => void save()}>{t("common.save")}</Button></div>
      </Modal>
    </>
  );
}
