import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, useApp } from "@/components/shell";
import { Button, PageHead, Panel } from "@/components/ui";
import { getReport } from "@/lib/stock/api";
import { Banner, Grid, asRows, exportRows, str, useFmt, useSnap } from "@/components/work";

export const Route = createFileRoute("/reports")({ component: Page });

function Page() {
  return (
    <Shell>
      <Reports />
    </Shell>
  );
}

const KINDS = ["valuation", "onhand", "movements", "low", "expiry", "slow", "serials"] as const;

function Reports() {
  const { org, t } = useApp();
  const fmt = useFmt();
  const [kind, setKind] = useState<(typeof KINDS)[number]>("onhand");
  const snap = useSnap(`report:${org.id}:${kind}`, () => getReport({ data: { orgId: org.id, kind } }).then(asRows), [org.id, kind]);
  const sample = snap.data?.[0] ?? {};
  const columns = Object.keys(sample).map((key) => ({
    key,
    label: key,
    className: ["qty", "cost", "value", "reserved", "reorder"].includes(key) ? "num" : "",
    render: (row: Record<string, unknown>) => {
      const value = str(row, key);
      if (key === "cost" || key === "value") return value ? fmt.money(value) : "—";
      if (key === "qty" || key === "reserved" || key === "reorder") return fmt.qty(value);
      if (key === "posted") return fmt.when(value);
      return value || "—";
    },
  }));
  return (
    <>
      <PageHead
        crumb={`${org.name} / ${t("nav.reports")}`}
        title={t("nav.reports")}
        actions={
          <>
            <Button variant="quiet" onClick={() => exportRows(`${kind}.csv`, snap.data ?? [], columns)}>{t("common.export")}</Button>
            <Button variant="quiet" onClick={() => window.print()}>{t("common.print")}</Button>
          </>
        }
      />
      <div className="mb-3 flex gap-2 overflow-x-auto">
        {KINDS.map((item) => (
          <Button key={item} variant={kind === item ? "primary" : "quiet"} className="h-8 shrink-0" onClick={() => setKind(item)}>
            {t(`report.${item}`)}
          </Button>
        ))}
      </div>
      <Banner code={snap.error} local={snap.local} />
      <Panel>
        <Grid columns={columns.length ? columns : [{ key: "empty", label: t("common.results") }]} rows={snap.data ?? []} />
      </Panel>
    </>
  );
}
