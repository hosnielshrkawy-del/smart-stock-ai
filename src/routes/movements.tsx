import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell, errText, queueMovement, useApp } from "@/components/shell";
import { Button, Field, Modal, PageHead, Panel, SelectInput, TextInput } from "@/components/ui";
import { getDocument, listDocuments, postDocument, reverseDocument, saveDocument } from "@/lib/stock/api";
import { Banner, Grid, LinesEditor, Status, asRows, blankLine, docLabel, nameOf, settle, str, takeIntent, toLinePayload, useCatalog, useFmt, useSnap, type DraftLine } from "@/components/work";
import { createUuid } from "@/lib/uuid";

export const Route = createFileRoute("/movements")({ component: Page });

function Page() {
  return (
    <Shell>
      <Movements />
    </Shell>
  );
}

const TYPES = ["receipt", "issue", "transfer", "adjustment", "opening", "damage", "return_in", "return_out", "consumption", "reservation", "reservation_release"];

function Movements() {
  const { org, lang, t, allowed } = useApp();
  const fmt = useFmt();
  const [docType, setDocType] = useState("");
  const [status, setStatus] = useState("");
  const snap = useSnap(`docs:${org.id}:${docType}:${status}`, () => listDocuments({ data: { orgId: org.id, docType, status } }).then(asRows), [org.id, docType, status]);
  const warehouses = useCatalog("warehouses");
  const partners = useCatalog(docType === "issue" || docType === "return_in" ? "customers" : "suppliers");
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("receipt");
  const [warehouseId, setWarehouseId] = useState("");
  const [warehouseToId, setWarehouseToId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [msg, setMsg] = useState("");
  const [detail, setDetail] = useState<{ header: Record<string, unknown> | null; lines: Record<string, unknown>[] } | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  useEffect(() => {
    const intent = takeIntent();
    if (intent && TYPES.includes(intent) && allowed("stock.post")) {
      setType(intent);
      setOpen(true);
    }
  }, [allowed]);

  const submit = async (post: boolean) => {
    const payloadLines = toLinePayload(lines, "stock");
    if (!payloadLines.length) return setMsg(t("err.EMPTY"));
    const payload = {
      orgId: org.id,
      idempotencyKey: createUuid(),
      docType: type,
      warehouseId,
      warehouseToId: type === "transfer" ? warehouseToId : undefined,
      partnerType: partnerId ? (type === "issue" || type === "return_in" ? "customer" : "supplier") : undefined,
      partnerId: partnerId || undefined,
      reference,
      reason,
      notes,
      lines: payloadLines,
    };
    if (!navigator.onLine) {
      queueMovement(payload);
      setMsg(t("common.queued"));
      return;
    }
    const saved = await saveDocument({ data: payload });
    if (!saved.ok || !saved.id) return setMsg(errText(t, saved.error));
    if (post) {
      const code = await settle(() => postDocument({ data: { orgId: org.id, id: saved.id! } }));
      if (code) return setMsg(errText(t, code));
    }
    setOpen(false);
    setLines([blankLine()]);
    setMsg("");
    snap.reload();
  };

  const openDoc = async (row: Record<string, unknown>) => {
    const result = await getDocument({ data: { orgId: org.id, id: str(row, "id") } });
    setDetail({ header: (result.header as Record<string, unknown> | null) ?? null, lines: asRows(result.lines) });
    setReverseReason("");
  };

  return (
    <>
      <PageHead
        crumb={`${org.name} / ${t("nav.movements")}`}
        title={t("nav.movements")}
        actions={allowed("stock.post") ? <Button onClick={() => { setMsg(""); setOpen(true); }}>{t("move.new")}</Button> : null}
      />
      <Banner code={snap.error} local={snap.local} />
      <Panel>
        <div className="flex flex-wrap gap-2 border-b border-line px-3 py-2">
          <SelectInput value={docType} onChange={(event) => setDocType(event.target.value)} className="max-w-48">
            <option value="">{t("common.all")}</option>
            {TYPES.map((item) => <option key={item} value={item}>{docLabel(t, item)}</option>)}
          </SelectInput>
          <SelectInput value={status} onChange={(event) => setStatus(event.target.value)} className="max-w-40">
            <option value="">{t("common.all")}</option>
            {["draft", "posted", "reversed"].map((item) => <option key={item} value={item}>{t(`status.${item}`)}</option>)}
          </SelectInput>
        </div>
        <Grid
          columns={[
            { key: "docNo", label: t("common.reference") },
            { key: "docType", label: t("move.type"), render: (row) => docLabel(t, str(row, "docType")) },
            { key: "warehouse", label: t("common.warehouse") },
            { key: "warehouseTo", label: t("move.to") },
            { key: "status", label: t("common.status"), render: (row) => <Status value={str(row, "status")} /> },
            { key: "createdAt", label: t("common.details"), render: (row) => fmt.when(str(row, "createdAt")) },
          ]}
          rows={snap.data ?? []}
          onRow={(row) => void openDoc(row)}
        />
      </Panel>

      <Modal open={open} title={t("move.new")} onClose={() => setOpen(false)} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("move.type")}>
            <SelectInput value={type} onChange={(event) => setType(event.target.value)}>
              {TYPES.map((item) => <option key={item} value={item}>{docLabel(t, item)}</option>)}
            </SelectInput>
          </Field>
          <Field label={t("common.warehouse")}>
            <SelectInput value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
              <option value="">{t("common.warehouse")}</option>
              {(warehouses.data ?? []).map((row) => <option key={str(row, "id")} value={str(row, "id")}>{nameOf(row, lang)}</option>)}
            </SelectInput>
          </Field>
          {type === "transfer" ? (
            <Field label={t("move.to")}>
              <SelectInput value={warehouseToId} onChange={(event) => setWarehouseToId(event.target.value)}>
                <option value="">{t("move.to")}</option>
                {(warehouses.data ?? []).map((row) => <option key={str(row, "id")} value={str(row, "id")}>{nameOf(row, lang)}</option>)}
              </SelectInput>
            </Field>
          ) : null}
          {["receipt", "issue", "return_in", "return_out"].includes(type) ? (
            <Field label={t("common.partner")}>
              <SelectInput value={partnerId} onChange={(event) => setPartnerId(event.target.value)}>
                <option value="">{t("common.none")}</option>
                {(partners.data ?? []).map((row) => <option key={str(row, "id")} value={str(row, "id")}>{nameOf(row, lang)}</option>)}
              </SelectInput>
            </Field>
          ) : null}
          <Field label={t("common.reference")}><TextInput value={reference} onChange={(event) => setReference(event.target.value)} /></Field>
          <Field label={t("common.reason")}><TextInput value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
          <LinesEditor lines={lines} setLines={setLines} mode="stock" />
        </div>
        {msg ? <p className="mt-3 text-sm text-danger">{msg}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="quiet" onClick={() => void submit(false)}>{t("common.draft")}</Button>
          <Button onClick={() => void submit(true)}>{t("common.post")}</Button>
        </div>
      </Modal>

      <Modal open={Boolean(detail?.header)} title={str(detail?.header ?? null, "docNo")} onClose={() => setDetail(null)} wide>
        {detail?.header ? (
          <>
            <div className="mb-3 flex items-center gap-2 text-sm">
              <Status value={str(detail.header, "status")} />
              <span>{docLabel(t, str(detail.header, "docType"))}</span>
            </div>
            <Grid
              columns={[
                { key: "sku", label: "SKU" },
                { key: "nameAr", label: t("common.product") },
                { key: "direction", label: t("common.direction"), render: (row) => t(str(row, "direction") === "in" ? "common.in" : "common.out") },
                { key: "qty", label: t("common.qty"), className: "num", render: (row) => fmt.qty(str(row, "qty")) },
                { key: "batchNo", label: t("common.batch") },
                { key: "unitCost", label: t("common.cost"), className: "num", render: (row) => (str(row, "unitCost") ? fmt.money(str(row, "unitCost")) : "—") },
              ]}
              rows={detail.lines}
            />
            {str(detail.header, "status") === "posted" && allowed("stock.reverse") ? (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Field label={t("common.reason")}><TextInput value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} /></Field>
                <Button
                  variant="danger"
                  onClick={() => void settle(() => reverseDocument({ data: { orgId: org.id, id: str(detail.header, "id"), reason: reverseReason } })).then((code) => {
                    if (!code) {
                      setDetail(null);
                      snap.reload();
                    } else setMsg(errText(t, code));
                  })}
                >
                  {t("common.reverse")}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </Modal>
    </>
  );
}