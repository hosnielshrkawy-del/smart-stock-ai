import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Boxes, ClipboardCheck, PackagePlus, Sparkles, ShoppingCart, Warehouse } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Shell, useApp } from "@/components/shell";
import { Button, PageHead, Panel, SkeletonRows } from "@/components/ui";
import { getDashboard, listAlerts } from "@/lib/stock/api";
import { Banner, Grid, Status, asRows, docLabel, setIntent, str, useFmt, useSnap } from "@/components/work";

export const Route = createFileRoute("/")({ component: Page });

function Page() {
  return (
    <Shell>
      <Home />
    </Shell>
  );
}

function langLabel(t: (key: string) => string, days: number) {
  const key = `dash.range${days}`;
  return t(key);
}

function Home() {
  const { org, t, lang } = useApp();
  const fmt = useFmt();
  const [days, setDays] = useState(30);
  const dash = useSnap(`dash:${org.id}:${days}`, () => getDashboard({ data: { orgId: org.id, days } }), [org.id, days]);
  const alerts = useSnap(`alerts:${org.id}`, () => listAlerts({ data: { orgId: org.id } }), [org.id]);
  const kpis = dash.data?.kpis;
  const tiles = kpis
    ? [
        { label: t("dash.skus"), value: String(kpis.skus), icon: Boxes, tone: "teal" },
        { label: t("dash.warehouses"), value: String(kpis.warehouses), icon: Warehouse, tone: "default" },
        { label: t("dash.value"), value: kpis.value == null ? "—" : fmt.money(kpis.value), icon: PackagePlus, tone: "teal" },
        { label: t("dash.low"), value: String(kpis.low), icon: AlertTriangle, tone: "warning" },
        { label: t("dash.out"), value: String(kpis.out), icon: ArrowDownToLine, tone: "danger" },
        { label: t("dash.slow"), value: String(kpis.slow), icon: Boxes, tone: "default" },
        { label: t("dash.expiring"), value: String(kpis.expiring), icon: AlertTriangle, tone: "warning" },
        { label: t("dash.openPo"), value: String(kpis.openPo), icon: ShoppingCart, tone: "default" },
        { label: t("dash.inbound"), value: fmt.qty(kpis.inbound), icon: ArrowDownToLine, tone: "teal" },
        { label: t("dash.outbound"), value: fmt.qty(kpis.outbound), icon: ArrowLeftRight, tone: "danger" },
      ]
    : [];
  const actions = [
    ["/products", "new", t("dash.qa.product")],
    ["/movements", "receipt", t("dash.qa.receipt")],
    ["/movements", "issue", t("dash.qa.issue")],
    ["/movements", "transfer", t("dash.qa.transfer")],
    ["/purchasing", "new", t("dash.qa.po")],
    ["/stocktaking", "new", t("dash.qa.count")],
    ["/suppliers", "new", t("dash.qa.supplier")],
    ["/assistant", "", t("dash.qa.ai")],
  ] as const;
  return (
    <>
      <PageHead
        crumb={`${org.name} / ${t("nav.overview")}`}
        title={t("nav.overview")}
        hint={t("dash.costMethod")}
        actions={
          <div className="flex rounded-xl border border-line bg-surface p-1 shadow-sm">
            {[7, 30, 90].map((span) => (
              <Button key={span} variant={days === span ? "primary" : "ghost"} className="h-8 px-3 text-xs" onClick={() => setDays(span)}>
                {t(`dash.range${span}`)}
              </Button>
            ))}
          </div>
        }
      />
      <Banner code={dash.error} local={dash.local} />
      {dash.loading && !dash.data ? <SkeletonRows /> : null}
      {kpis && kpis.skus === 0 && Number(kpis.inbound) === 0 ? <p className="mb-3 rounded-xl border border-dashed border-line bg-surface px-4 py-3 text-sm text-muted">{t("dash.empty")}</p> : null}
      {kpis && kpis.value == null ? <p className="mb-3 text-xs text-muted">{t("dash.costHidden")}</p> : null}
      <section className="mb-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h2 className="text-sm font-semibold">{lang === "ar" ? "ملخص المخزون" : "Inventory overview"}</h2><p className="mt-0.5 text-xs text-muted">{langLabel(t, days)}</p></div>
          <span className="rounded-full bg-teal-soft px-2.5 py-1 text-[11px] font-medium text-teal">{lang === "ar" ? "مؤشرات الأداء" : "Key metrics"}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {tiles.map((tile) => (
            <div key={tile.label} className="dashboard-metric">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="line-clamp-2 text-[11px] font-semibold text-muted">{tile.label}</span>
                <span className={`dashboard-metric-icon ${tile.tone}`}><tile.icon className="h-[17px] w-[17px]" /></span>
              </div>
              <div className="num truncate text-[22px] font-bold tracking-tight text-ink">{tile.value}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">{t("common.quickActions")}</h2><span className="text-[11px] text-muted">{lang === "ar" ? "اختصارات للمهام اليومية" : "Daily shortcuts"}</span></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {actions.map(([to, intent, label], index) => {
            const Icon = [PackagePlus, ArrowDownToLine, ArrowLeftRight, ArrowLeftRight, ShoppingCart, ClipboardCheck, Warehouse, Sparkles][index];
            return <Link key={label} to={to} onClick={() => intent && setIntent(intent)} className="dashboard-shortcut group"><span className="dashboard-shortcut-icon"><Icon className="h-[17px] w-[17px]" /></span><span>{label}</span><ArrowUpRight className="ms-auto h-3.5 w-3.5 shrink-0 text-muted opacity-0 transition group-hover:opacity-100" /></Link>;
          })}
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="rounded-2xl p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">{t("dash.flow")}</h2><span className="text-[11px] text-muted">{t(`dash.range${days}`)}</span></div>
          <div className="h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={(dash.data?.series ?? []).map((row) => ({ day: row.day.slice(5), inbound: Number(row.inbound), outbound: Number(row.outbound) }))}>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--line)" />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--line)" width={32} />
                <Tooltip />
                <Area type="monotone" dataKey="inbound" name={t("common.in")} stroke="var(--teal)" fill="var(--teal-soft)" />
                <Area type="monotone" dataKey="outbound" name={t("common.out")} stroke="var(--warning)" fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel className="rounded-2xl p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("dash.top")}</h2>
          {(dash.data?.top.length ?? 0) === 0 ? (
            <p className="text-sm text-muted">{t("common.empty")}</p>
          ) : (
            <div className="h-56" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(dash.data?.top ?? []).map((row) => ({ name: row.name, qty: Number(row.qty) }))} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 11, fill: "var(--muted)" }} />
                  <Tooltip />
                  <Bar dataKey="qty" fill="var(--teal)" radius={3} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel className="rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">{t("dash.alerts")}</h2>
            <Link to="/notifications" className="text-xs text-teal">{t("nav.notifications")}</Link>
          </div>
          <ul className="space-y-2">
            {(alerts.data ?? []).slice(0, 6).map((alert) => (
              <li key={alert.key} className="flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
                <span className="mt-0.5 text-warning"><AlertTriangle className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-[11px] font-medium text-muted">{t(`alert.${alert.kind}`)}</span>
                <span className="mx-1">·</span>
                {alert.title}
                {alert.detail ? <span className="num ms-2 text-xs text-muted">{alert.detail}</span> : null}</span>
              </li>
            ))}
            {(alerts.data ?? []).length === 0 ? <li className="text-sm text-muted">{t("common.empty")}</li> : null}
          </ul>
        </Panel>
        <Panel className="overflow-hidden rounded-2xl xl:col-span-2">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">{t("dash.recent")}</h2>
          <Grid
            columns={[
              { key: "docNo", label: t("common.reference") },
              { key: "docType", label: t("move.type"), render: (row) => docLabel(t, str(row, "docType")) },
              { key: "status", label: t("common.status"), render: (row) => <Status value={str(row, "status")} /> },
              { key: "createdAt", label: t("common.details"), render: (row) => fmt.when(str(row, "postedAt") || str(row, "createdAt")) },
            ]}
            rows={asRows(dash.data?.recent)}
          />
        </Panel>
      </div>
      {(dash.data?.byWh.length ?? 0) > 0 ? (
        <Panel className="mt-4 rounded-2xl p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("dash.byWh")}</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {dash.data?.byWh.map((row) => (
              <div key={row.name} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                <span className="truncate">{row.name}</span>
                <span className="num">{row.value ? fmt.money(row.value) : "—"}</span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </>
  );
}
