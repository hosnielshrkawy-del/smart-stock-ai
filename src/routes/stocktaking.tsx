import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck, FileClock, CheckCircle2, Warehouse } from "lucide-react";
import { useEffect, useState } from "react";
import { Shell, errText, useApp } from "@/components/shell";
import { Button, Field, MetricCard, Modal, PageHead, Panel, SelectInput, TextInput } from "@/components/ui";
import { createStocktake, listStocktakes, postStocktake, saveStocktakeCounts, stocktakeLines } from "@/lib/stock/api";
import { Banner, Grid, Status, asRows, nameOf, settle, str, takeIntent, useCatalog, useFmt, useSnap } from "@/components/work";

export const Route = createFileRoute("/stocktaking")({ component: Page });

function Page() {
  return (
    <Shell>
      <Stocktaking />
    </Shell>
  );
}

function Stocktaking() {
  const { org, lang, t, allowed } = useApp();
  const fmt = useFmt();
  const list = useSnap(`count:${org.id}`, () => listStocktakes({ data: { orgId: org.id } }).then(asRows), [org.id]);
  const warehouses = useCatalog("warehouses");
  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("");
  const [focus, setFocus] = useState<Record<string, unknown> | null>(null);
  const [lines, setLines] = useState<Record<string, unknown>[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    if (takeIntent() === "new") setOpen(true);
  }, []);

  const openOne = async (row: Record<string, unknown>) => {
    setFocus(row);
    const result = await stocktakeLines({ data: { orgId: org.id, id: str(row, "id") } });
    const next = asRows(result);
    setLines(next);
    const map: Record<string, string> = {};
    for (const line of next) map[str(line, "id")] = str(line, "countedQty");
    setCounts(map);
  };

  return (
    <>
      <PageHead crumb={`${org.name} / ${t("nav.stocktaking")}`} title={t("nav.stocktaking")} hint={t("count.hint")} actions={allowed("stocktake.post") ? <Button onClick={() => setOpen(true)}>{t("count.new")}</Button> : null} />
      <Banner code={list.error} local={list.local} />
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label={t("common.results")} value={(list.data ?? []).length} icon={<ClipboardCheck size={19} />} tone="teal" />
        <MetricCard label={t("status.draft")} value={(list.data ?? []).filter((row) => str(row, "status") === "draft").length} icon={<FileClock size={19} />} />
        <MetricCard label={t("common.posted")} value={(list.data ?? []).filter((row) => str(row, "status") === "posted").length} icon={<CheckCircle2 size={19} />} />
        <MetricCard label={t("common.warehouse")} value={(warehouses.data ?? []).length} icon={<Warehouse size={19} />} />
      </div>
      <Panel>
        <Grid
          columns={[
            { key: "docNo", label: t("common.reference") },
            { key: "warehouse", label: t("common.warehouse") },
            { key: "status", label: t("common.status"), render: (row) => <Status value={str(row, "status")} /> },
            { key: "createdAt", label: t("common.details"), render: (row) => fmt.when(str(row, "createdAt")) },
          ]}
          rows={list.data ?? []}
          onRow={(row) => void openOne(row)}
        />
      </Panel>
      <Modal open={open} title={t("count.new")} onClose={() => setOpen(false)}>
        <Field label={t("common.warehouse")}>
          <SelectInput value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
            <option value="">{t("common.warehouse")}</option>
            {(warehouses.data ?? []).map((row) => <option key={str(row, "id")} value={str(row, "id")}>{nameOf(row, lang)}</option>)}
          </SelectInput>
        </Field>
        <div className="mt-3"><Field label={t("common.notes")}><TextInput value={notes} onChange={(event) => setNotes(event.target.value)} /></Field></div>
        {msg ? <p className="mt-2 text-sm text-danger">{msg}</p> : null}
        <div className="mt-4 flex justify-end">
          <Button onClick={() => void settle(() => createStocktake({ data: { orgId: org.id, warehouseId, notes } })).then((code) => { if (code) setMsg(errText(t, code)); else { setOpen(false); list.reload(); } })}>{t("common.create")}</Button>
        </div>
      </Modal>
      <Modal open={Boolean(focus)} title={str(focus, "docNo")} onClose={() => setFocus(null)} wide>
        {focus ? (
          <>
            <Grid
              columns={[
                { key: "sku", label: "SKU" },
                { key: "nameAr", label: t("common.product") },
                { key: "systemQty", label: t("count.system"), className: "num", render: (row) => fmt.qty(str(row, "systemQty")) },
                { key: "counted", label: t("count.counted"), render: (row) => <TextInput className="h-8" value={counts[str(row, "id")] ?? ""} onChange={(event) => setCounts({ ...counts, [str(row, "id")]: event.target.value })} /> },
                { key: "variance", label: t("count.variance"), className: "num", render: (row) => {
                  const counted = counts[str(row, "id")];
                  if (counted === "" || counted == null) return "—";
                  return fmt.qty(Number(counted) - Number(str(row, "systemQty")));
                } },
                { key: "reason", label: t("common.reason"), render: (row) => <TextInput className="h-8" value={reasons[str(row, "id")] ?? str(row, "reason")} onChange={(event) => setReasons({ ...reasons, [str(row, "id")]: event.target.value })} /> },
              ]}
              rows={lines}
            />
            {str(focus, "status") === "draft" ? (
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="quiet" onClick={() => void settle(() => saveStocktakeCounts({ data: { orgId: org.id, id: str(focus, "id"), lines: lines.map((line) => ({ id: str(line, "id"), countedQty: counts[str(line, "id")] === "" ? null : Number(counts[str(line, "id")]), reason: reasons[str(line, "id")] })) } })).then((code) => setMsg(code ? errText(t, code) : t("common.saved")))}>{t("common.save")}</Button>
                {allowed("stocktake.post") ? <Button onClick={() => void settle(async () => { await saveStocktakeCounts({ data: { orgId: org.id, id: str(focus, "id"), lines: lines.map((line) => ({ id: str(line, "id"), countedQty: counts[str(line, "id")] === "" ? null : Number(counts[str(line, "id")]), reason: reasons[str(line, "id")] })) } }); return postStocktake({ data: { orgId: org.id, id: str(focus, "id") } }); }).then((code) => { if (code) setMsg(errText(t, code)); else { setFocus(null); list.reload(); } })}>{t("count.post")}</Button> : null}
              </div>
            ) : null}
            {msg ? <p className="mt-2 text-sm text-danger">{msg}</p> : null}
          </>
        ) : null}
      </Modal>
    </>
  );
}
