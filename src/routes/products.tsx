import { createFileRoute } from "@tanstack/react-router";
import { Archive, Boxes, CircleAlert, PackagePlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Shell, errText, useApp } from "@/components/shell";
import { Badge, Button, Field, MetricCard, Modal, PageHead, Panel, SelectInput, TextArea, TextInput } from "@/components/ui";
import { importProducts, listProducts, saveProduct, setProductStatus } from "@/lib/stock/api";
import { BarcodeArt, Banner, Check, Grid, Scanner, SearchBox, asRows, exportRows, nameOf, settle, str, takeIntent, useCatalog, useFmt } from "@/components/work";

export const Route = createFileRoute("/products")({ component: Page });

function Page() {
  return (
    <Shell>
      <Products />
    </Shell>
  );
}

type Draft = {
  id?: string;
  sku: string;
  barcode: string;
  nameAr: string;
  nameEn: string;
  description: string;
  image: string;
  categoryId: string;
  brand: string;
  manufacturer: string;
  productType: string;
  baseUnitId: string;
  price: string;
  reorderPoint: string;
  minQty: string;
  maxQty: string;
  supplierId: string;
  trackBatch: boolean;
  trackExpiry: boolean;
  trackSerial: boolean;
  parentId: string;
  notes: string;
  custom: Record<string, string>;
  units: { unitId: string; factor: string }[];
};

const empty = (): Draft => ({
  sku: "",
  barcode: "",
  nameAr: "",
  nameEn: "",
  description: "",
  image: "",
  categoryId: "",
  brand: "",
  manufacturer: "",
  productType: "standard",
  baseUnitId: "",
  price: "",
  reorderPoint: "0",
  minQty: "0",
  maxQty: "",
  supplierId: "",
  trackBatch: false,
  trackExpiry: false,
  trackSerial: false,
  parentId: "",
  notes: "",
  custom: {},
  units: [],
});

const TYPES = ["standard", "variant", "bundle", "raw", "finished", "spare", "asset", "consumable", "service"];

function Products() {
  const { org, lang, t, allowed } = useApp();
  const fmt = useFmt();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(empty());
  const [msg, setMsg] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState<{ sku: string; nameAr: string; nameEn?: string; barcode?: string; cost?: number; price?: number; reorder?: number; exists: boolean }[]>([]);
  const [scan, setScan] = useState(false);
  const [label, setLabel] = useState<Record<string, unknown> | null>(null);
  const categories = useCatalog("categories");
  const units = useCatalog("units");
  const suppliers = useCatalog("suppliers");
  const fields = useCatalog("fields");
  const hidden = useMemo(() => new Set((localStorage.getItem("ss-cols") ?? "").split(",").filter(Boolean)), []);
  const [cols, setCols] = useState(hidden);
  const [colsOpen, setColsOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await listProducts({ data: { orgId: org.id, q, status, page } });
      setRows(asRows(result.rows));
      setTotal(result.total);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "VALIDATION");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    if (takeIntent() === "new" && allowed("products.write")) {
      setDraft(empty());
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.id, q, status, page]);

  const save = async () => {
    if (!draft.sku.trim() || !draft.nameAr.trim()) return setMsg(t("common.required"));
    const code = await settle(() =>
      saveProduct({
        data: {
          orgId: org.id,
          id: draft.id,
          sku: draft.sku,
          barcode: draft.barcode,
          nameAr: draft.nameAr,
          nameEn: draft.nameEn,
          description: draft.description,
          image: draft.image,
          categoryId: draft.categoryId || undefined,
          brand: draft.brand,
          manufacturer: draft.manufacturer,
          productType: draft.productType,
          baseUnitId: draft.baseUnitId || undefined,
          price: Number(draft.price) || 0,
          reorderPoint: Number(draft.reorderPoint) || 0,
          minQty: Number(draft.minQty) || 0,
          maxQty: draft.maxQty === "" ? null : Number(draft.maxQty),
          supplierId: draft.supplierId || undefined,
          trackBatch: draft.trackBatch,
          trackExpiry: draft.trackExpiry,
          trackSerial: draft.trackSerial,
          parentId: draft.parentId || undefined,
          notes: draft.notes,
          custom: draft.custom,
          units: draft.units.filter((unit) => unit.unitId && Number(unit.factor) > 0).map((unit) => ({ unitId: unit.unitId, factor: Number(unit.factor) })),
        },
      }),
    );
    if (code) setMsg(errText(t, code));
    else {
      setOpen(false);
      void load();
    }
  };

  const edit = (row: Record<string, unknown>) => {
    const custom = row.custom && typeof row.custom === "object" ? (row.custom as Record<string, string>) : {};
    setDraft({
      ...empty(),
      id: str(row, "id"),
      sku: str(row, "sku"),
      barcode: str(row, "barcode"),
      nameAr: str(row, "nameAr"),
      nameEn: str(row, "nameEn"),
      description: str(row, "description"),
      image: str(row, "image"),
      categoryId: str(row, "categoryId"),
      brand: str(row, "brand"),
      manufacturer: str(row, "manufacturer"),
      productType: str(row, "productType") || "standard",
      baseUnitId: str(row, "baseUnitId"),
      price: str(row, "price"),
      reorderPoint: str(row, "reorderPoint"),
      minQty: str(row, "minQty"),
      maxQty: str(row, "maxQty"),
      supplierId: str(row, "supplierId"),
      trackBatch: Boolean(row.trackBatch),
      trackExpiry: Boolean(row.trackExpiry),
      trackSerial: Boolean(row.trackSerial),
      parentId: str(row, "parentId"),
      notes: str(row, "notes"),
      custom,
    });
    setMsg("");
    setOpen(true);
  };

  const allColumns = [
    { key: "sku", label: "SKU" },
    { key: "nameAr", label: t("common.product"), render: (row: Record<string, unknown>) => nameOf(row, lang) },
    { key: "productType", label: t("product.type"), render: (row: Record<string, unknown>) => t(`type.${str(row, "productType")}`) },
    { key: "onHand", label: t("common.onHand"), className: "num", render: (row: Record<string, unknown>) => fmt.qty(str(row, "onHand")) },
    { key: "price", label: t("common.price"), className: "num", render: (row: Record<string, unknown>) => fmt.money(str(row, "price")) },
    { key: "reorderPoint", label: t("product.reorder"), className: "num", render: (row: Record<string, unknown>) => fmt.qty(str(row, "reorderPoint")) },
    { key: "status", label: t("common.status"), render: (row: Record<string, unknown>) => <Badge tone={str(row, "status") === "active" ? "good" : "neutral"}>{str(row, "status") === "active" ? t("common.active") : t("common.archived")}</Badge> },
  ];
  const visible = allColumns.filter((column) => !cols.has(column.key) || column.key === "sku" || column.key === "nameAr");

  const onFile = async (file: File) => {
    const text = await file.text();
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    const headers = splitCsv(lines[0] ?? "").map((cell) => cell.trim().toLowerCase());
    const existing = new Set(rows.map((row) => str(row, "sku")));
    const parsed = lines.slice(1).map((line) => {
      const cells = splitCsv(line);
      const get = (name: string) => cells[headers.indexOf(name)]?.trim() ?? "";
      const sku = get("sku");
      return {
        sku,
        nameAr: get("name_ar") || get("name"),
        nameEn: get("name_en"),
        barcode: get("barcode"),
        cost: Number(get("cost")) || undefined,
        price: Number(get("price")) || undefined,
        reorder: Number(get("reorder")) || undefined,
        exists: existing.has(sku),
      };
    }).filter((row) => row.sku || row.nameAr);
    setPreview(parsed);
    setImportOpen(true);
  };

  return (
    <>
      <PageHead
        crumb={`${org.name} / ${t("nav.products")}`}
        title={t("nav.products")}
        actions={
          <>
            <Button variant="quiet" onClick={() => setColsOpen(true)}>{t("common.more")}</Button>
            <Button variant="quiet" onClick={() => exportRows("products.csv", rows, allColumns)}>{t("common.export")}</Button>
            {allowed("products.write") ? (
              <label className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-line bg-surface px-3 text-sm">
                {t("product.import")}
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onFile(file); event.target.value = ""; }} />
              </label>
            ) : null}
            {allowed("products.write") ? <Button onClick={() => { setDraft(empty()); setMsg(""); setOpen(true); }}>{t("product.new")}</Button> : null}
          </>
        }
      />
      <Banner code={error} />
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label={t("common.results")} value={total} icon={<Boxes size={19} />} tone="teal" />
        <MetricCard label={t("common.page")} value={rows.length} detail={t("common.results")} icon={<PackagePlus size={19} />} />
        <MetricCard label={t("common.selected")} value={picked.length} icon={<Archive size={19} />} />
        <MetricCard label={t("product.reorder")} value={rows.filter((row) => Number(str(row, "reorderPoint")) > 0 && Number(str(row, "onHand")) <= Number(str(row, "reorderPoint"))).length} detail={t("common.onHand")} icon={<CircleAlert size={19} />} tone="warning" />
      </div>
      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2/60 px-3 py-3">
          <SearchBox value={q} onChange={(value) => { setPage(0); setQ(value); }} placeholder={t("search.placeholder")} />
          <SelectInput value={status} onChange={(event) => { setPage(0); setStatus(event.target.value); }} className="max-w-36">
            <option value="">{t("common.all")}</option>
            <option value="active">{t("common.active")}</option>
            <option value="archived">{t("common.archived")}</option>
          </SelectInput>
          <Button variant="quiet" onClick={() => setScan(true)}>{t("common.scan")}</Button>
          <span className="ms-auto text-xs text-muted">{total} {t("common.results")}</span>
        </div>
        {picked.length && allowed("products.archive") ? (
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm">
            <span>{picked.length} {t("common.selected")}</span>
            <Button variant="quiet" className="h-8" onClick={() => void Promise.all(picked.map((id) => setProductStatus({ data: { orgId: org.id, id, status: "archived" } }))).then(() => { setPicked([]); void load(); })}>{t("common.archive")}</Button>
          </div>
        ) : null}
        {loading && !rows.length ? <div className="p-4 text-sm text-muted">{t("common.loading")}</div> : (
          <Grid
            columns={[
              { key: "pick", label: "", render: (row) => <input type="checkbox" checked={picked.includes(str(row, "id"))} onChange={(event) => setPicked((current) => event.target.checked ? [...current, str(row, "id")] : current.filter((id) => id !== str(row, "id")))} onClick={(event) => event.stopPropagation()} /> },
              ...visible,
            ]}
            rows={rows}
            onRow={edit}
          />
        )}
        <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-2 text-sm">
          <Button variant="quiet" className="h-8" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>{t("common.prev")}</Button>
          <span className="text-xs text-muted">{t("common.page")} {page + 1}</span>
          <Button variant="quiet" className="h-8" disabled={(page + 1) * 50 >= total} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button>
        </div>
      </Panel>

      <Modal open={open} title={draft.id ? t("common.edit") : t("product.new")} onClose={() => setOpen(false)} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("product.sku")}><TextInput value={draft.sku} onChange={(event) => setDraft({ ...draft, sku: event.target.value })} /></Field>
          <Field label={t("product.barcode")}><TextInput value={draft.barcode} onChange={(event) => setDraft({ ...draft, barcode: event.target.value })} /></Field>
          <Field label={t("common.nameAr")}><TextInput value={draft.nameAr} onChange={(event) => setDraft({ ...draft, nameAr: event.target.value })} /></Field>
          <Field label={t("common.nameEn")}><TextInput value={draft.nameEn} onChange={(event) => setDraft({ ...draft, nameEn: event.target.value })} /></Field>
          <Field label={t("product.type")}>
            <SelectInput value={draft.productType} onChange={(event) => setDraft({ ...draft, productType: event.target.value })}>
              {TYPES.map((type) => <option key={type} value={type}>{t(`type.${type}`)}</option>)}
            </SelectInput>
          </Field>
          <Field label={t("nav.categories")}>
            <SelectInput value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>
              <option value="">{t("common.none")}</option>
              {(categories.data ?? []).map((row) => <option key={str(row, "id")} value={str(row, "id")}>{nameOf(row, lang)}</option>)}
            </SelectInput>
          </Field>
          <Field label={t("common.unit")}>
            <SelectInput value={draft.baseUnitId} onChange={(event) => setDraft({ ...draft, baseUnitId: event.target.value })}>
              <option value="">{t("common.none")}</option>
              {(units.data ?? []).map((row) => <option key={str(row, "id")} value={str(row, "id")}>{nameOf(row, lang)}</option>)}
            </SelectInput>
          </Field>
          <Field label={t("common.supplier")}>
            <SelectInput value={draft.supplierId} onChange={(event) => setDraft({ ...draft, supplierId: event.target.value })}>
              <option value="">{t("common.none")}</option>
              {(suppliers.data ?? []).map((row) => <option key={str(row, "id")} value={str(row, "id")}>{nameOf(row, lang)}</option>)}
            </SelectInput>
          </Field>
          <Field label={t("product.brand")}><TextInput value={draft.brand} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} /></Field>
          <Field label={t("product.manufacturer")}><TextInput value={draft.manufacturer} onChange={(event) => setDraft({ ...draft, manufacturer: event.target.value })} /></Field>
          <Field label={t("common.price")}><TextInput inputMode="decimal" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} /></Field>
          <Field label={t("product.reorder")}><TextInput inputMode="decimal" value={draft.reorderPoint} onChange={(event) => setDraft({ ...draft, reorderPoint: event.target.value })} /></Field>
          <Field label={t("product.min")}><TextInput inputMode="decimal" value={draft.minQty} onChange={(event) => setDraft({ ...draft, minQty: event.target.value })} /></Field>
          <Field label={t("product.max")}><TextInput inputMode="decimal" value={draft.maxQty} onChange={(event) => setDraft({ ...draft, maxQty: event.target.value })} /></Field>
          <Field label={t("common.description")}><TextArea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
          <Field label={t("common.notes")}><TextArea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></Field>
          <Check label={t("product.trackBatch")} checked={draft.trackBatch} onChange={(trackBatch) => setDraft({ ...draft, trackBatch })} />
          <Check label={t("product.trackExpiry")} checked={draft.trackExpiry} onChange={(trackExpiry) => setDraft({ ...draft, trackExpiry })} />
          <Check label={t("product.trackSerial")} checked={draft.trackSerial} onChange={(trackSerial) => setDraft({ ...draft, trackSerial })} />
          <Field label={t("product.image")}>
            <input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void shrinkImage(file).then((image) => setDraft((current) => ({ ...current, image }))); }} />
            {draft.image ? <img src={draft.image} alt="" className="mt-2 h-16 w-16 rounded-md object-cover" /> : null}
          </Field>
          {(fields.data ?? []).map((field) => (
            <Field key={str(field, "id")} label={lang === "en" ? str(field, "labelEn") || str(field, "labelAr") : str(field, "labelAr")}>
              {str(field, "fieldType") === "select" ? (
                <SelectInput value={draft.custom[str(field, "key")] ?? ""} onChange={(event) => setDraft({ ...draft, custom: { ...draft.custom, [str(field, "key")]: event.target.value } })}>
                  <option value="">{t("common.none")}</option>
                  {optionsOf(field.options).map((option) => <option key={option}>{option}</option>)}
                </SelectInput>
              ) : (
                <TextInput value={draft.custom[str(field, "key")] ?? ""} onChange={(event) => setDraft({ ...draft, custom: { ...draft.custom, [str(field, "key")]: event.target.value } })} />
              )}
            </Field>
          ))}
          <div className="sm:col-span-2">
            <p className="mb-1 text-sm text-muted">{t("product.units")}</p>
            <p className="mb-2 text-xs text-muted">{t("product.factorHint")}</p>
            {draft.units.map((unit, index) => (
              <div key={index} className="mb-2 grid grid-cols-2 gap-2">
                <SelectInput value={unit.unitId} onChange={(event) => setDraft({ ...draft, units: draft.units.map((item, i) => i === index ? { ...item, unitId: event.target.value } : item) })}>
                  <option value="">{t("common.unit")}</option>
                  {(units.data ?? []).map((row) => <option key={str(row, "id")} value={str(row, "id")}>{nameOf(row, lang)}</option>)}
                </SelectInput>
                <TextInput value={unit.factor} placeholder={t("product.factor")} onChange={(event) => setDraft({ ...draft, units: draft.units.map((item, i) => i === index ? { ...item, factor: event.target.value } : item) })} />
              </div>
            ))}
            <Button variant="quiet" onClick={() => setDraft({ ...draft, units: [...draft.units, { unitId: "", factor: "" }] })}>{t("common.addLine")}</Button>
          </div>
        </div>
        {msg ? <p className="mt-3 text-sm text-danger">{msg}</p> : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {draft.barcode || draft.sku ? <Button variant="quiet" onClick={() => setLabel({ sku: draft.sku, nameAr: draft.nameAr, barcode: draft.barcode || draft.sku, price: draft.price })}>{t("product.label")}</Button> : null}
          {draft.id && allowed("products.archive") ? <Button variant="danger" onClick={() => void setProductStatus({ data: { orgId: org.id, id: draft.id!, status: "archived" } }).then(() => { setOpen(false); void load(); })}>{t("common.archive")}</Button> : null}
          {allowed("products.write") ? <Button onClick={() => void save()}>{t("common.save")}</Button> : null}
        </div>
      </Modal>

      <Modal open={importOpen} title={t("product.preview")} onClose={() => setImportOpen(false)} wide>
        <p className="mb-2 text-xs text-muted">{t("product.importHint")}</p>
        <Grid
          columns={[
            { key: "sku", label: "SKU" },
            { key: "nameAr", label: t("common.nameAr") },
            { key: "exists", label: t("common.status"), render: (row) => row.exists ? t("product.dup") : t("common.create") },
          ]}
          rows={preview}
        />
        <div className="mt-3 flex justify-end">
          <Button onClick={() => void importProducts({ data: { orgId: org.id, rows: preview } }).then(() => { setImportOpen(false); void load(); })}>{t("product.importGo")}</Button>
        </div>
      </Modal>

      <Modal open={colsOpen} title={t("common.more")} onClose={() => setColsOpen(false)}>
        {allColumns.map((column) => (
          <Check key={column.key} label={column.label} checked={!cols.has(column.key)} onChange={(on) => {
            const next = new Set(cols);
            if (on) next.delete(column.key); else next.add(column.key);
            setCols(next);
            localStorage.setItem("ss-cols", [...next].join(","));
          }} />
        ))}
      </Modal>

      <Modal open={Boolean(label)} title={t("product.label")} onClose={() => setLabel(null)}>
        {label ? (
          <div className="mx-auto max-w-xs rounded-lg border border-line p-4 text-center">
            <div className="text-sm font-medium">{str(label, "nameAr")}</div>
            <div className="my-3"><BarcodeArt value={str(label, "barcode")} className="mx-auto h-16 w-full" /></div>
            <div className="font-mono text-xs">{str(label, "barcode")}</div>
            <div className="num mt-1 text-sm">{fmt.money(str(label, "price"))}</div>
            <Button className="mt-3" variant="quiet" onClick={() => window.print()}>{t("common.print")}</Button>
          </div>
        ) : null}
      </Modal>
      {scan ? <Scanner onClose={() => setScan(false)} onCode={(code) => { setQ(code); setPage(0); setScan(false); }} /> : null}
    </>
  );
}

function optionsOf(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function splitCsv(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      cells.push(current);
      current = "";
    } else current += ch;
  }
  cells.push(current);
  return cells;
}

async function shrinkImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}
