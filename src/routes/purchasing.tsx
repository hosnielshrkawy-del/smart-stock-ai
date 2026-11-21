import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList, FileClock, PackageCheck, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { Shell, errText, useApp } from "@/components/shell";
import { Button, Field, MetricCard, Modal, PageHead, Panel, SelectInput, TextInput } from "@/components/ui";
import { extractInvoice, getOrder, listOrders, receivePurchase, reorderLines, savePurchase, setPurchaseStatus } from "@/lib/stock/api";
import { Banner, Grid, LinesEditor, Status, asRows, blankLine, nameOf, settle, str, takeIntent, toLinePayload, useCatalog, useFmt, useSnap, type DraftLine } from "@/components/work";
import { createUuid } from "@/lib/uuid";

export const Route = createFileRoute("/purchasing")({ component: Page });

function Page() {
  return (
    <Shell>
      <Purchasing />
    </Shell>
  );
}

function Purchasing() {
  const { org, lang, t, allowed } = useApp();
  const fmt = useFmt();
  const orders = useSnap(`po:${org.id}`, () => listOrders({ data: { orgId: org.id, kind: "purchase" } }).then(asRows), [org.id]);
  const suppliers = useCatalog("suppliers");
  const warehouses = useCatalog("warehouses");
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [msg, setMsg] = useState("");
  const [focus, setFocus] = useState<Record<string, unknown> | null>(null);
  const [orderLines, setOrderLines] = useState<Record<string, unknown>[]>([]);
  const [receive, setReceive] = useState<Record<string, string>>({});
  const [invoice, setInvoice] = useState("");

  useEffect(() => {
    if (takeIntent() === "new" && allowed("purchasing.write")) setOpen(true);
  }, [allowed]);

  const openOrder = async (row: Record<string, unknown>) => {
    setFocus(row);
    const result = await getOrder({ data: { orgId: org.id, id: str(row, "id"), kind: "purchase" } });
    const next = asRows(result.lines);
    setOrderLines(next);
    const qty: Record<string, string> = {};
    for (const line of next) qty[str(line, "id")] = String(Math.max(0, Number(str(line, "qty")) - Number(str(line, "qtyReceived"))));
    setReceive(qty);
  };

  const create = async () => {
    const payload = toLinePayload(lines, "buy");
    if (!supplierId || !warehouseId || !payload.length) return setMsg(t("common.required"));
    const code = await settle(() => savePurchase({ data: { orgId: org.id, supplierId, warehouseId, expectedDate, notes, lines: payload } }));
    if (code) setMsg(errText(t, code));
    else {
      setOpen(false);
      setLines([blankLine()]);
      orders.reload();
    }
  };

  const draftFromReorder = async () => {
    const rows = await reorderLines({ data: { orgId: org.id } });
    if (!rows.length) return setMsg(t("common.empty"));
    const supplier = rows.find((row) => row.supplierId)?.supplierId ?? "";
    setSupplierId(supplier);
    setLines(rows.map((row) => ({ ...blankLine(), productId: row.productId, qty: String(Math.ceil(Number(row.suggest))) })));
    setOpen(true);
  };

  return (
    <>
      <PageHead
        crumb={`${org.name} / ${t("nav.purchasing")}`}
        title={t("nav.purchasing")}
        hint={t("po.hint")}
        actions={
          allowed("purchasing.write") ? (
            <>
              <Button variant="quiet" onClick={() => void draftFromReorder()}>{t("ai.draft")}</Button>
              <Button onClick={() => { setMsg(""); setOpen(true); }}>{t("po.new")}</Button>
            </>
          ) : null
        }
      />
      <Banner code={orders.error} local={orders.local} />
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label={t("common.results")} value={(orders.data ?? []).length} icon={<ClipboardList size={19} />} tone="teal" />
        <MetricCard label={t("status.draft")} value={(orders.data ?? []).filter((row) => str(row, "status") === "draft").length} icon={<FileClock size={19} />} />
        <MetricCard label={t("po.approve")} value={(orders.data ?? []).filter((row) => ["approved", "partial"].includes(str(row, "status"))).length} detail={t("po.receive")} icon={<PackageCheck size={19} />} tone="warning" />
        <MetricCard label={t("status.received")} value={(orders.data ?? []).filter((row) => str(row, "status") === "received").length} icon={<Truck size={19} />} />
      </div>
      <Panel>
        <Grid
          columns={[
            { key: "docNo", label: t("common.reference") },
            { key: "supplier", label: t("common.supplier") },
            { key: "warehouse", label: t("common.warehouse") },
            { key: "expectedDate", label: t("po.expected") },
            { key: "status", label: t("common.status"), render: (row) => <Status value={str(row, "status")} /> },
          ]}
          rows={orders.data ?? []}
          onRow={(row) => void openOrder(row)}
        />
      </Panel>

      <Modal open={open} title={t("po.new")} onClose={() => setOpen(false)} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("common.supplier")}>
            <SelectInput value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              <option value="">{t("common.supplier")}</option>
              {(suppliers.data ?? []).map((row) => <option key={str(row, "id")} value={str(row, "id")}>{nameOf(row, lang)}</option>)}
            </SelectInput>
          </Field>
          <Field label={t("common.warehouse")}>
            <SelectInput value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
              <option value="">{t("common.warehouse")}</option>
              {(warehouses.data ?? []).map((row) => <option key={str(row, "id")} value={str(row, "id")}>{nameOf(row, lang)}</option>)}
            </SelectInput>
          </Field>
          <Field label={t("po.expected")}><TextInput type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></Field>
          <Field label={t("common.notes")}><TextInput value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
          <LinesEditor lines={lines} setLines={setLines} mode="buy" />
          {allowed("ai.use") ? (
            <label className="text-sm text-muted sm:col-span-2">
              {t("ai.invoice")}
              <input className="mt-1 block text-ink" type="file" accept="image/*" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => void extractInvoice({ data: { orgId: org.id, dataUrl: String(reader.result) } }).then((result) => {
                  if (!result.ok) {
                    const aiKey: Record<string, string> = {
                      AI_NOT_CONFIGURED: "ai.notConfigured",
                      AI_INVALID_KEY: "ai.invalidKey",
                      AI_PROVIDER_RATE: "ai.providerRate",
                      RATE: "ai.appRate",
                      AI_MODEL: "ai.modelUnavailable",
                      AI_TIMEOUT: "ai.timeout",
                    };
                    setMsg(aiKey[result.error] ? t(aiKey[result.error]) : errText(t, result.error));
                  } else setInvoice(result.raw);
                });
                reader.readAsDataURL(file);
              }} />
            </label>
          ) : null}
        </div>
        {invoice ? <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-surface-2 p-2 text-xs">{invoice}</pre> : null}
        <p className="mt-2 text-xs text-muted">{t("ai.confidence")}</p>
        {msg ? <p className="mt-2 text-sm text-danger">{msg}</p> : null}
        <div className="mt-4 flex justify-end"><Button onClick={() => void create()}>{t("common.draft")}</Button></div>
      </Modal>

      <Modal open={Boolean(focus)} title={str(focus, "docNo")} onClose={() => setFocus(null)} wide>
        {focus ? (
          <>
            <div className="mb-3"><Status value={str(focus, "status")} /></div>
            <Grid
              columns={[
                { key: "sku", label: "SKU" },
                { key: "nameAr", label: t("common.product") },
                { key: "qty", label: t("po.ordered"), className: "num", render: (row) => fmt.qty(str(row, "qty")) },
                { key: "qtyReceived", label: t("po.received"), className: "num", render: (row) => fmt.qty(str(row, "qtyReceived")) },
                { key: "unitPrice", label: t("common.price"), className: "num", render: (row) => (str(row, "unitPrice") ? fmt.money(str(row, "unitPrice")) : "—") },
                { key: "now", label: t("po.receive"), render: (row) => <TextInput className="h-8" value={receive[str(row, "id")] ?? ""} onChange={(event) => setReceive({ ...receive, [str(row, "id")]: event.target.value })} /> },
              ]}
              rows={orderLines}
            />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {str(focus, "status") === "draft" && allowed("purchasing.approve") ? (
                <Button onClick={() => void settle(() => setPurchaseStatus({ data: { orgId: org.id, id: str(focus, "id"), status: "approved" } })).then((code) => { if (code) setMsg(errText(t, code)); else { setFocus(null); orders.reload(); } })}>{t("po.approve")}</Button>
              ) : null}
              {["approved", "partial"].includes(str(focus, "status")) && allowed("stock.post") ? (
                <Button onClick={() => void settle(() => receivePurchase({
                  data: {
                    orgId: org.id,
                    id: str(focus, "id"),
                    idempotencyKey: createUuid(),
                    lines: orderLines.map((line) => ({ lineId: str(line, "id"), qty: Number(receive[str(line, "id")] || 0) })).filter((line) => line.qty > 0),
                  },
                })).then((code) => { if (code) setMsg(errText(t, code)); else { setFocus(null); orders.reload(); } })}>{t("po.receive")}</Button>
              ) : null}
              {["draft", "approved"].includes(str(focus, "status")) && allowed("purchasing.write") ? (
                <Button variant="quiet" onClick={() => void settle(() => setPurchaseStatus({ data: { orgId: org.id, id: str(focus, "id"), status: "cancelled" } })).then(() => { setFocus(null); orders.reload(); })}>{t("common.cancel")}</Button>
              ) : null}
            </div>
            {msg ? <p className="mt-2 text-sm text-danger">{msg}</p> : null}
          </>
        ) : null}
      </Modal>
    </>
  );
}