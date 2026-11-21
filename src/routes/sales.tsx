import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList, FileClock, PackageCheck, Truck } from "lucide-react";
import { useState } from "react";
import { Shell, errText, useApp } from "@/components/shell";
import { Button, Field, MetricCard, Modal, PageHead, Panel, SelectInput, TextInput } from "@/components/ui";
import { getOrder, listOrders, salesAction, saveSales } from "@/lib/stock/api";
import { Banner, Grid, LinesEditor, Status, asRows, blankLine, nameOf, settle, str, toLinePayload, useCatalog, useFmt, useSnap, type DraftLine } from "@/components/work";
import { createUuid } from "@/lib/uuid";

export const Route = createFileRoute("/sales")({ component: Page });

function Page() {
  return (
    <Shell>
      <Sales />
    </Shell>
  );
}

function Sales() {
  const { org, lang, t, allowed } = useApp();
  const fmt = useFmt();
  const orders = useSnap(`so:${org.id}`, () => listOrders({ data: { orgId: org.id, kind: "sales" } }).then(asRows), [org.id]);
  const customers = useCatalog("customers");
  const warehouses = useCatalog("warehouses");
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [msg, setMsg] = useState("");
  const [focus, setFocus] = useState<Record<string, unknown> | null>(null);
  const [orderLines, setOrderLines] = useState<Record<string, unknown>[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});

  const openOrder = async (row: Record<string, unknown>) => {
    setFocus(row);
    const result = await getOrder({ data: { orgId: org.id, id: str(row, "id"), kind: "sales" } });
    const next = asRows(result.lines);
    setOrderLines(next);
    const map: Record<string, string> = {};
    for (const line of next) map[str(line, "id")] = String(Math.max(0, Number(str(line, "qty")) - Number(str(line, "qtyDispatched"))));
    setQty(map);
  };

  const create = async () => {
    const payload = toLinePayload(lines, "sell");
    if (!warehouseId || !payload.length) return setMsg(t("common.required"));
    const code = await settle(() => saveSales({ data: { orgId: org.id, customerId: customerId || undefined, warehouseId, notes, lines: payload } }));
    if (code) setMsg(errText(t, code));
    else {
      setOpen(false);
      orders.reload();
    }
  };

  const act = async (action: string) => {
    if (!focus) return;
    const code = await settle(() => salesAction({
      data: {
        orgId: org.id,
        id: str(focus, "id"),
        action,
        idempotencyKey: createUuid(),
        lines: action === "dispatch" ? orderLines.map((line) => ({ lineId: str(line, "id"), qty: Number(qty[str(line, "id")] || 0) })).filter((line) => line.qty > 0) : undefined,
      },
    }));
    if (code) setMsg(errText(t, code));
    else {
      setFocus(null);
      orders.reload();
    }
  };

  return (
    <>
      <PageHead crumb={`${org.name} / ${t("nav.sales")}`} title={t("nav.sales")} actions={allowed("sales.write") ? <Button onClick={() => { setMsg(""); setOpen(true); }}>{t("so.new")}</Button> : null} />
      <Banner code={orders.error} local={orders.local} />
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label={t("common.results")} value={(orders.data ?? []).length} icon={<ClipboardList size={19} />} tone="teal" />
        <MetricCard label={t("status.draft")} value={(orders.data ?? []).filter((row) => str(row, "status") === "draft").length} icon={<FileClock size={19} />} />
        <MetricCard label={t("status.confirmed")} value={(orders.data ?? []).filter((row) => ["confirmed", "partial"].includes(str(row, "status"))).length} detail={t("so.dispatch")} icon={<PackageCheck size={19} />} tone="warning" />
        <MetricCard label={t("status.fulfilled")} value={(orders.data ?? []).filter((row) => ["fulfilled", "dispatched"].includes(str(row, "status"))).length} icon={<Truck size={19} />} />
      </div>
      <Panel>
        <Grid
          columns={[
            { key: "docNo", label: t("common.reference") },
            { key: "customer", label: t("common.customer") },
            { key: "warehouse", label: t("common.warehouse") },
            { key: "status", label: t("common.status"), render: (row) => <Status value={str(row, "status")} /> },
            { key: "createdAt", label: t("common.details"), render: (row) => fmt.when(str(row, "createdAt")) },
          ]}
          rows={orders.data ?? []}
          onRow={(row) => void openOrder(row)}
        />
      </Panel>
      <Modal open={open} title={t("so.new")} onClose={() => setOpen(false)} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("common.customer")}>
            <SelectInput value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">{t("common.none")}</option>
              {(customers.data ?? []).map((row) => <option key={str(row, "id")} value={str(row, "id")}>{nameOf(row, lang)}</option>)}
            </SelectInput>
          </Field>
          <Field label={t("common.warehouse")}>
            <SelectInput value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
              <option value="">{t("common.warehouse")}</option>
              {(warehouses.data ?? []).map((row) => <option key={str(row, "id")} value={str(row, "id")}>{nameOf(row, lang)}</option>)}
            </SelectInput>
          </Field>
          <Field label={t("common.notes")}><TextInput value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
          <LinesEditor lines={lines} setLines={setLines} mode="sell" />
        </div>
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
                { key: "qty", label: t("common.qty"), className: "num", render: (row) => fmt.qty(str(row, "qty")) },
                { key: "qtyDispatched", label: t("so.dispatched"), className: "num", render: (row) => fmt.qty(str(row, "qtyDispatched")) },
                { key: "unitPrice", label: t("common.price"), className: "num", render: (row) => fmt.money(str(row, "unitPrice")) },
                { key: "now", label: t("so.dispatch"), render: (row) => <TextInput className="h-8" value={qty[str(row, "id")] ?? ""} onChange={(event) => setQty({ ...qty, [str(row, "id")]: event.target.value })} /> },
              ]}
              rows={orderLines}
            />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {str(focus, "status") === "draft" && allowed("sales.write") ? <Button onClick={() => void act("confirm")}>{t("so.confirm")}</Button> : null}
              {["confirmed", "partial"].includes(str(focus, "status")) && allowed("stock.post") ? <Button onClick={() => void act("dispatch")}>{t("so.dispatch")}</Button> : null}
              {str(focus, "status") === "draft" ? <Button variant="quiet" onClick={() => void act("cancel")}>{t("so.cancel")}</Button> : null}
            </div>
            {msg ? <p className="mt-2 text-sm text-danger">{msg}</p> : null}
          </>
        ) : null}
      </Modal>
    </>
  );
}