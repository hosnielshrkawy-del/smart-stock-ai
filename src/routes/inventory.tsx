import { createFileRoute } from "@tanstack/react-router";
import { Boxes, Layers3, PackageCheck, Warehouse } from "lucide-react";
import { useMemo, useState } from "react";
import { Shell, useApp } from "@/components/shell";
import { Button, MetricCard, PageHead, Panel, SelectInput } from "@/components/ui";
import { listBalances } from "@/lib/stock/api";
import { Banner, Grid, Scanner, SearchBox, Toolbar, asRows, exportRows, nameOf, str, useCatalog, useFmt, useSnap } from "@/components/work";

export const Route = createFileRoute("/inventory")({ component: Page });

function Page() {
  return (
    <Shell>
      <Inventory />
    </Shell>
  );
}

function Inventory() {
  const { org, lang, t } = useApp();
  const fmt = useFmt();
  const [q, setQ] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [sort, setSort] = useState("name");
  const [scan, setScan] = useState(false);
  const warehouses = useCatalog("warehouses");
  const snap = useSnap(
    `bal:${org.id}:${q}:${warehouseId}`,
    () => listBalances({ data: { orgId: org.id, q, warehouseId: warehouseId || undefined } }).then(asRows),
    [org.id, q, warehouseId],
  );
  const rows = useMemo(() => {
    const copy = [...(snap.data ?? [])];
    copy.sort((a, b) => {
      if (sort === "qty") return Number(str(b, "onHand")) - Number(str(a, "onHand"));
      return nameOf(a, lang).localeCompare(nameOf(b, lang), lang);
    });
    return copy;
  }, [snap.data, sort, lang]);
  const columns = [
    { key: "sku", label: "SKU" },
    { key: "nameAr", label: t("common.product"), render: (row: Record<string, unknown>) => nameOf(row, lang) },
    { key: "warehouse", label: t("common.warehouse") },
    { key: "onHand", label: t("common.onHand"), className: "num", render: (row: Record<string, unknown>) => fmt.qty(str(row, "onHand")) },
    { key: "reserved", label: t("common.reserved"), className: "num", render: (row: Record<string, unknown>) => fmt.qty(str(row, "reserved")) },
    { key: "available", label: t("common.available"), className: "num", render: (row: Record<string, unknown>) => fmt.qty(str(row, "available")) },
    { key: "avgCost", label: t("common.cost"), className: "num", render: (row: Record<string, unknown>) => (str(row, "avgCost") ? fmt.money(str(row, "avgCost")) : "—") },
  ];
  return (
    <>
      <PageHead
        crumb={`${org.name} / ${t("nav.inventory")}`}
        title={t("nav.inventory")}
        hint={t("dash.costMethod")}
        actions={<Button variant="quiet" onClick={() => exportRows("inventory.csv", rows, columns)}>{t("common.export")}</Button>}
      />
      <Banner code={snap.error} local={snap.local} />
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label={t("common.product")} value={rows.length} icon={<Boxes size={19} />} tone="teal" />
        <MetricCard label={t("common.warehouse")} value={(warehouses.data ?? []).length} icon={<Warehouse size={19} />} />
        <MetricCard label={t("common.onHand")} value={fmt.qty(rows.reduce((sum, row) => sum + Number(str(row, "onHand") || 0), 0))} icon={<Layers3 size={19} />} />
        <MetricCard label={t("common.available")} value={fmt.qty(rows.reduce((sum, row) => sum + Number(str(row, "available") || 0), 0))} icon={<PackageCheck size={19} />} />
      </div>
      <Panel>
        <Toolbar>
          <div className="px-3 pt-3">
            <SearchBox value={q} onChange={setQ} placeholder={t("search.placeholder")} />
          </div>
          <div className="px-3 pt-3">
            <SelectInput value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="max-w-52">
              <option value="">{t("common.all")}</option>
              {(warehouses.data ?? []).map((row) => (
                <option key={str(row, "id")} value={str(row, "id")}>{nameOf(row, lang)}</option>
              ))}
            </SelectInput>
          </div>
          <div className="px-3 pt-3">
            <SelectInput value={sort} onChange={(event) => setSort(event.target.value)} className="max-w-40">
              <option value="name">{t("common.product")}</option>
              <option value="qty">{t("common.qty")}</option>
            </SelectInput>
          </div>
          <div className="px-3 pt-3">
            <Button variant="quiet" onClick={() => setScan(true)}>{t("common.scan")}</Button>
          </div>
          <span className="ms-auto px-3 pt-3 text-xs text-muted">{rows.length} {t("common.results")}</span>
        </Toolbar>
        <Grid columns={columns} rows={rows} />
      </Panel>
      {scan ? <Scanner onClose={() => setScan(false)} onCode={(code) => { setQ(code); setScan(false); }} /> : null}
    </>
  );
}
