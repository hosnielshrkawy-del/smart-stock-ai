import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, errText, useApp } from "@/components/shell";
import { Button, Field, Modal, PageHead, Panel, SelectInput, TextInput } from "@/components/ui";
import { listBoms, runProduction, saveBom } from "@/lib/stock/api";
import { Banner, Grid, LinesEditor, blankLine, nameOf, settle, str, toLinePayload, useCatalog, useSnap, type DraftLine } from "@/components/work";

export const Route = createFileRoute("/production")({ component: Page });

function Page() {
  return (
    <Shell>
      <Production />
    </Shell>
  );
}

function Production() {
  const { org, lang, t, allowed } = useApp();
  const boms = useSnap(`bom:${org.id}`, () => listBoms({ data: { orgId: org.id } }), [org.id]);
  const warehouses = useCatalog("warehouses");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [productId, setProductId] = useState("");
  const [yieldQty, setYieldQty] = useState("1");
  const [kind, setKind] = useState(org.industry === "restaurant" ? "recipe" : "manufacturing");
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [runId, setRunId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [runs, setRuns] = useState("1");
  const [msg, setMsg] = useState("");
  const rows = (boms.data?.boms ?? []) as Record<string, unknown>[];
  return (
    <>
      <PageHead crumb={`${org.name} / ${t("nav.production")}`} title={t("nav.production")} actions={allowed("products.write") ? <Button onClick={() => setOpen(true)}>{t("common.create")}</Button> : null} />
      <Banner code={boms.error} local={boms.local} />
      <Panel>
        <Grid
          columns={[
            { key: "name", label: t("common.nameAr") },
            { key: "product", label: t("common.product") },
            { key: "kind", label: t("prod.kind") },
            { key: "yieldQty", label: t("prod.yield") },
          ]}
          rows={rows}
          onRow={(row) => setRunId(str(row, "id"))}
        />
      </Panel>
      <Modal open={open} title={t("nav.production")} onClose={() => setOpen(false)} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("common.nameAr")}><TextInput value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label={t("prod.kind")}>
            <SelectInput value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="manufacturing">BOM</option>
              <option value="recipe">{t("nav.production")}</option>
            </SelectInput>
          </Field>
          <Field label={t("prod.yield")}><TextInput value={yieldQty} onChange={(event) => setYieldQty(event.target.value)} /></Field>
          <div className="sm:col-span-2">
            <p className="mb-1 text-sm text-muted">{t("type.finished")}</p>
            <LinesEditor lines={[{ ...blankLine(), productId }]} setLines={(next) => setProductId(next[0]?.productId ?? "")} mode="bom" />
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1 text-sm text-muted">{t("prod.components")}</p>
            <LinesEditor lines={lines} setLines={setLines} mode="bom" />
          </div>
        </div>
        {msg ? <p className="mt-2 text-sm text-danger">{msg}</p> : null}
        <div className="mt-4 flex justify-end">
          <Button onClick={() => void settle(() => saveBom({ data: { orgId: org.id, name, productId, kind, yieldQty: Number(yieldQty) || 1, lines: toLinePayload(lines, "bom") } })).then((code) => { if (code) setMsg(errText(t, code)); else { setOpen(false); boms.reload(); } })}>{t("common.save")}</Button>
        </div>
      </Modal>
      <Modal open={Boolean(runId)} title={t("prod.run")} onClose={() => setRunId("")}>
        <Field label={t("common.warehouse")}>
          <SelectInput value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
            <option value="">{t("common.warehouse")}</option>
            {(warehouses.data ?? []).map((row) => <option key={str(row, "id")} value={str(row, "id")}>{nameOf(row, lang)}</option>)}
          </SelectInput>
        </Field>
        <div className="mt-3"><Field label={t("prod.run")}><TextInput value={runs} onChange={(event) => setRuns(event.target.value)} /></Field></div>
        {msg ? <p className="mt-2 text-sm text-danger">{msg}</p> : null}
        <div className="mt-4 flex justify-end">
          <Button disabled={!allowed("stock.post")} onClick={() => void settle(() => runProduction({ data: { orgId: org.id, bomId: runId, warehouseId, runs: Number(runs) || 1 } })).then((code) => { if (code) setMsg(errText(t, code)); else setRunId(""); })}>{t("common.post")}</Button>
        </div>
      </Modal>
    </>
  );
}
