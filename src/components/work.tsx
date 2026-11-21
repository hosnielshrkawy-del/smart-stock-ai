import { useEffect, useRef, useState, type ReactNode } from "react";
import { errText, useApp } from "@/components/shell";
import { Badge, Button, EmptyState, Field, Modal, PageHead, Panel, SelectInput, SkeletonRows, TextArea, TextInput, statusTone } from "@/components/ui";
import { code128Bars } from "@/lib/stock/barcode";
import { downloadCsv, fmtMoney, fmtQty, fmtWhen } from "@/lib/stock/format";
import { listProducts, listSimple, saveSimple } from "@/lib/stock/api";
import { createUuid } from "@/lib/uuid";

export type Row = Record<string, unknown>;

export function str(row: Row | null | undefined, key: string) {
  if (!row) return "";
  const value = row[key];
  return value == null ? "" : String(value);
}

export function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

export function nameOf(row: Row, lang: string) {
  const en = str(row, "nameEn");
  const ar = str(row, "nameAr");
  return (lang === "en" && en) || ar || en || str(row, "name") || str(row, "sku") || str(row, "code");
}

export function setIntent(value: string) {
  sessionStorage.setItem("ss-intent", value);
}

export function takeIntent() {
  const value = sessionStorage.getItem("ss-intent");
  if (value) sessionStorage.removeItem("ss-intent");
  return value;
}

export function faultCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.match(/SS:([A-Z0-9_]+)/)?.[1] || message.match(/\b(FORBIDDEN|VALIDATION|RATE|UNAVAILABLE|NOT_FOUND)\b/)?.[1] || "";
}

export async function settle(run: () => Promise<{ ok: boolean; error?: string } | void>) {
  try {
    const result = await run();
    if (result && "ok" in result && !result.ok) return result.error || "VALIDATION";
    return "";
  } catch (error) {
    return faultCode(error) || "VALIDATION";
  }
}

function idb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("smart-stock", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("snap")) request.result.createObjectStore("snap");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function cachePut(key: string, value: unknown) {
  try {
    const db = await idb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("snap", "readwrite");
      tx.objectStore("snap").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* local cache is optional */
  }
}

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const db = await idb();
    const value = await new Promise<T | undefined>((resolve, reject) => {
      const request = db.transaction("snap", "readonly").objectStore("snap").get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return value ?? null;
  } catch {
    return null;
  }
}

export function useSnap<T>(key: string, run: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [local, setLocal] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    run()
      .then(async (value) => {
        if (!live) return;
        setData(value);
        setLocal(false);
        setError("");
        await cachePut(key, value);
      })
      .catch(async (error: unknown) => {
        const cached = await cacheGet<T>(key);
        if (!live) return;
        if (cached != null) {
          setData(cached);
          setLocal(true);
          setError("");
        } else setError(faultCode(error) || "VALIDATION");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // The loader closes over the latest deps; key + deps are the contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, key, ...deps]);
  return { data, setData, loading, local, error, reload: () => setTick((n) => n + 1) };
}

export function useFmt() {
  const { org, lang } = useApp();
  return {
    qty: (value: unknown) => fmtQty(typeof value === "number" || typeof value === "string" ? value : String(value ?? ""), lang),
    money: (value: unknown) => fmtMoney(typeof value === "number" || typeof value === "string" ? value : null, org.currency, lang),
    when: (value: unknown) => fmtWhen(typeof value === "string" ? value : null, lang, org.timezone),
  };
}

export function Crumb({ title }: { title: string }) {
  const { org } = useApp();
  return `${org.name} / ${title}`;
}

export function Banner({ code, local }: { code?: string; local?: boolean }) {
  const { t } = useApp();
  if (local) return <p className="mb-3 text-sm text-warning">{t("common.local")}</p>;
  if (!code) return null;
  return <p className="mb-3 text-sm text-danger">{errText(t, code)}</p>;
}

export function Status({ value }: { value: string }) {
  const { t } = useApp();
  const key = `status.${value}`;
  const label = t(key) === key ? value : t(key);
  return <Badge tone={statusTone(value)}>{label}</Badge>;
}

export function docLabel(t: (key: string) => string, type: string) {
  const key = `doc.${type}`;
  const label = t(key);
  return label === key ? type : label;
}

export function BarcodeArt({ value, className }: { value: string; className?: string }) {
  const bars = code128Bars(value);
  if (!bars) return <span className="font-mono text-xs">{value}</span>;
  const width = bars.reduce((sum, bar) => sum + bar, 0);
  let x = 0;
  const marks: { x: number; w: number }[] = [];
  bars.forEach((bar, index) => {
    if (index % 2 === 0) marks.push({ x, w: bar });
    x += bar;
  });
  return (
    <svg viewBox={`0 0 ${width} 42`} className={className} role="img" aria-label={value}>
      <rect width={width} height="42" fill="#ffffff" />
      {marks.map((mark, index) => (
        <rect key={index} x={mark.x} y="0" width={mark.w} height="42" fill="#111827" />
      ))}
    </svg>
  );
}

export function Grid({
  columns,
  rows,
  onRow,
  empty,
}: {
  columns: { key: string; label: string; render?: (row: Row) => ReactNode; className?: string }[];
  rows: Row[];
  onRow?: (row: Row) => void;
  empty?: string;
}) {
  const { t } = useApp();
  if (!rows.length) return <EmptyState title={empty || t("common.empty")} />;
  return (
    <div className="table-scroll app-scrollbar">
      <table className="data-table w-full border-collapse text-sm">
        <thead className="sticky top-0">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="whitespace-nowrap px-4 py-3.5 text-start">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={str(row, "id") || str(row, "key") || index}
              className={`border-t border-line transition-colors ${onRow ? "cursor-pointer" : ""}`}
              onClick={() => onRow?.(row)}
            >
              {columns.map((column) => (
                <td key={column.key} className={`px-4 py-3.5 align-middle ${column.className ?? ""}`}>
                  {column.render ? column.render(row) : str(row, column.key) || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  const { t } = useApp();
  return <TextInput value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder || t("common.search")} className="max-w-xs" />;
}

export function useCatalog(kind: string) {
  const { org } = useApp();
  return useSnap(`${kind}:${org.id}`, () => listSimple({ data: { orgId: org.id, kind } }).then(asRows), [org.id, kind]);
}

export function CatalogScreen({
  kind,
  title,
  hint,
  columns,
  blank,
  fields,
  write,
}: {
  kind: string;
  title: string;
  hint?: string;
  columns: { key: string; label: string; render?: (row: Row) => ReactNode }[];
  blank: () => Record<string, string | boolean>;
  fields: (draft: Record<string, string | boolean>, set: (key: string, value: string | boolean) => void, rows: Row[]) => ReactNode;
  write: boolean;
}) {
  const { org, t } = useApp();
  const snap = useCatalog(kind);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string | boolean>>(blank());
  const [msg, setMsg] = useState("");
  const rows = (snap.data ?? []).filter((row) => {
    const blob = Object.values(row).join(" ").toLowerCase();
    return blob.includes(q.trim().toLowerCase());
  });
  const save = async () => {
    const code = await settle(() => saveSimple({ data: { orgId: org.id, kind, row: draft } }));
    if (code) setMsg(errText(t, code));
    else {
      setOpen(false);
      setMsg("");
      snap.reload();
    }
  };
  return (
    <>
      <PageHead
        crumb={`${org.name} / ${title}`}
        title={title}
        hint={hint}
        actions={
          write ? (
            <Button
              onClick={() => {
                setDraft(blank());
                setMsg("");
                setOpen(true);
              }}
            >
              {t("common.create")}
            </Button>
          ) : null
        }
      />
      <Banner code={snap.error} local={snap.local} />
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
          <SearchBox value={q} onChange={setQ} />
          <span className="text-xs text-muted">
            {rows.length} {t("common.results")}
          </span>
        </div>
        {snap.loading && !snap.data ? <SkeletonRows /> : <Grid columns={[...columns, ...(write ? [{ key: "edit", label: t("common.actions"), render: (row: Row) => (
          <Button
            variant="ghost"
            className="h-8"
            onClick={(event) => {
              event.stopPropagation();
              const next: Record<string, string | boolean> = {};
              for (const [key, value] of Object.entries(row)) next[key] = typeof value === "boolean" ? value : value == null ? "" : String(value);
              setDraft(next);
              setMsg("");
              setOpen(true);
            }}
          >
            {t("common.edit")}
          </Button>
        ) }] : [])]} rows={rows} />}
      </Panel>
      <Modal open={open} title={title} onClose={() => setOpen(false)} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields(draft, (key, value) => setDraft((current) => ({ ...current, [key]: value })), snap.data ?? [])}
        </div>
        {msg ? <p className="mt-3 text-sm text-danger">{msg}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="quiet" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => void save()}>{t("common.save")}</Button>
        </div>
      </Modal>
    </>
  );
}

export function ProductFinder({
  value,
  onPick,
}: {
  value: string;
  onPick: (id: string) => void;
}) {
  const { org, lang, t } = useApp();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => {
      listProducts({ data: { orgId: org.id, q, status: "active", page: 0 } })
        .then((result) => setRows(asRows(result.rows)))
        .catch(() => setRows([]));
    }, 180);
    return () => clearTimeout(timer);
  }, [org.id, q]);
  return (
    <div className="grid gap-1">
      <TextInput value={q} onChange={(event) => setQ(event.target.value)} placeholder={t("search.placeholder")} />
      <SelectInput value={value} onChange={(event) => onPick(event.target.value)}>
        <option value="">{t("common.product")}</option>
        {rows.map((row) => (
          <option key={str(row, "id")} value={str(row, "id")}>
            {str(row, "sku")} — {nameOf(row, lang)}
          </option>
        ))}
      </SelectInput>
    </div>
  );
}

export type DraftLine = {
  key: string;
  productId: string;
  qty: string;
  unitCost: string;
  unitPrice: string;
  taxRate: string;
  batchNo: string;
  expiry: string;
  serialNo: string;
  direction: "in" | "out";
  unitId: string;
  locationId: string;
  lineId?: string;
};

export function blankLine(): DraftLine {
  return {
    key: createUuid(),
    productId: "",
    qty: "1",
    unitCost: "",
    unitPrice: "",
    taxRate: "",
    batchNo: "",
    expiry: "",
    serialNo: "",
    direction: "in",
    unitId: "",
    locationId: "",
  };
}

export function LinesEditor({
  lines,
  setLines,
  mode,
}: {
  lines: DraftLine[];
  setLines: (lines: DraftLine[]) => void;
  mode: "stock" | "buy" | "sell" | "bom";
}) {
  const { t } = useApp();
  const patch = (key: string, partial: Partial<DraftLine>) => setLines(lines.map((line) => (line.key === key ? { ...line, ...partial } : line)));
  return (
    <div className="space-y-2 sm:col-span-2">
      {lines.map((line, index) => (
        <div key={line.key} className="grid gap-2 rounded-lg border border-line p-2 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <ProductFinder value={line.productId} onPick={(id) => patch(line.key, { productId: id })} />
          </div>
          <TextInput value={line.qty} onChange={(event) => patch(line.key, { qty: event.target.value })} placeholder={t("common.qty")} inputMode="decimal" />
          {mode === "stock" ? (
            <SelectInput value={line.direction} onChange={(event) => patch(line.key, { direction: event.target.value === "out" ? "out" : "in" })}>
              <option value="in">{t("common.in")}</option>
              <option value="out">{t("common.out")}</option>
            </SelectInput>
          ) : null}
          {mode === "stock" || mode === "buy" ? (
            <TextInput value={line.unitCost || line.unitPrice} onChange={(event) => patch(line.key, mode === "buy" ? { unitPrice: event.target.value } : { unitCost: event.target.value })} placeholder={mode === "buy" ? t("common.price") : t("common.cost")} inputMode="decimal" />
          ) : null}
          {mode === "sell" ? (
            <TextInput value={line.unitPrice} onChange={(event) => patch(line.key, { unitPrice: event.target.value })} placeholder={t("common.price")} inputMode="decimal" />
          ) : null}
          {mode === "stock" ? (
            <>
              <TextInput value={line.batchNo} onChange={(event) => patch(line.key, { batchNo: event.target.value })} placeholder={t("common.batch")} />
              <TextInput type="date" value={line.expiry} onChange={(event) => patch(line.key, { expiry: event.target.value })} />
              <TextInput value={line.serialNo} onChange={(event) => patch(line.key, { serialNo: event.target.value })} placeholder={t("common.serial")} />
            </>
          ) : null}
          <Button variant="ghost" className="h-10" onClick={() => setLines(lines.filter((item) => item.key !== line.key))} disabled={lines.length === 1 && index === 0 && mode !== "bom"}>
            {t("common.remove")}
          </Button>
        </div>
      ))}
      <Button variant="quiet" onClick={() => setLines([...lines, blankLine()])}>{t("common.addLine")}</Button>
    </div>
  );
}

export function toLinePayload(lines: DraftLine[], mode: "stock" | "buy" | "sell" | "bom") {
  return lines
    .filter((line) => line.productId && Number(line.qty) > 0)
    .map((line) => ({
      productId: line.productId,
      qty: Number(line.qty),
      unitId: line.unitId || undefined,
      unitCost: line.unitCost ? Number(line.unitCost) : undefined,
      unitPrice: line.unitPrice ? Number(line.unitPrice) : undefined,
      taxRate: line.taxRate ? Number(line.taxRate) : undefined,
      direction: mode === "stock" ? line.direction : undefined,
      batchNo: line.batchNo || undefined,
      expiry: line.expiry || undefined,
      serialNo: line.serialNo || undefined,
      locationId: line.locationId || undefined,
    }));
}

export function exportRows(filename: string, rows: Row[], columns: { key: string; label: string }[]) {
  downloadCsv(filename, [columns.map((column) => column.label), ...rows.map((row) => columns.map((column) => str(row, column.key)))]);
}

export function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const { t } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [err, setErr] = useState("");
  useEffect(() => {
    let stop = false;
    let stream: MediaStream | null = null;
    const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setErr(t("common.error"));
      return;
    }
    const detector = new Detector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e"] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (next) => {
        stream = next;
        if (!videoRef.current) return;
        videoRef.current.srcObject = next;
        await videoRef.current.play();
        const tick = async () => {
          if (stop || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            if (found[0]?.rawValue) {
              onCodeRef.current(found[0].rawValue);
              return;
            }
          } catch {
            /* wait for a frame */
          }
          if (!stop) requestAnimationFrame(() => void tick());
        };
        void tick();
      })
      .catch(() => setErr(t("common.error")));
    return () => {
      stop = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [t]);
  return (
    <Modal open title={t("common.scan")} onClose={onClose}>
      {err ? <p className="text-sm text-danger">{err}</p> : <video ref={videoRef} className="aspect-video w-full rounded-lg bg-navy" muted playsInline />}
    </Modal>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex h-10 items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

export function TextField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <Field label={label}>
      {type === "area" ? <TextArea value={value} onChange={(event) => onChange(event.target.value)} /> : <TextInput type={type} value={value} onChange={(event) => onChange(event.target.value)} />}
    </Field>
  );
}