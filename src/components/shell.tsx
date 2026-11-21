import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Boxes,
  ClipboardCheck,
  Factory,
  LayoutDashboard,
  Menu,
  Moon,
  Package,
  Settings,
  ShoppingCart,
  Sparkles,
  Sun,
  Tags,
  Truck,
  Users,
  Warehouse,
  BarChart3,
  ArrowLeftRight,
  Shield,
  X,
  GitBranch,
  CreditCard,
  Wallet,
  Search,
  Plus,
  ChevronDown,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode, createContext, useContext } from "react";
import { authClient, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { createOrganization, getPlatformAdminStatus, getWorkspace, saveDocument, postDocument } from "@/lib/stock/api";
import { INDUSTRIES, modulesFor, type ModuleId } from "@/lib/stock/industries";
import { translate, type Lang } from "@/lib/stock/i18n";
import { can, type Perm } from "@/lib/stock/permissions";
import { Button, Field, SelectInput, TextInput } from "./ui";

export type OrgRecord = Awaited<ReturnType<typeof getWorkspace>>[number];

type AppCtx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  org: OrgRecord;
  orgs: OrgRecord[];
  setOrgId: (id: string) => void;
  reload: () => void;
  allowed: (perm: Perm) => boolean;
  modules: ModuleId[];
};

const Ctx = createContext<AppCtx | null>(null);
export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("app");
  return v;
}

const NAV: { to: string; key: string; icon: typeof Package; mod: ModuleId; group: string; perm?: Perm }[] = [
  { to: "/", key: "nav.overview", icon: LayoutDashboard, mod: "overview", group: "work" },
  { to: "/inventory", key: "nav.inventory", icon: Boxes, mod: "inventory", group: "work" },
  { to: "/movements", key: "nav.movements", icon: ArrowLeftRight, mod: "movements", group: "work" },
  { to: "/purchasing", key: "nav.purchasing", icon: ShoppingCart, mod: "purchasing", group: "work" },
  { to: "/sales", key: "nav.sales", icon: Truck, mod: "sales", group: "work" },
  { to: "/stocktaking", key: "nav.stocktaking", icon: ClipboardCheck, mod: "stocktaking", group: "work" },
  { to: "/production", key: "nav.production", icon: Factory, mod: "production", group: "work" },
  { to: "/products", key: "nav.products", icon: Package, mod: "products", group: "master" },
  { to: "/categories", key: "nav.categories", icon: Tags, mod: "categories", group: "master" },
  { to: "/warehouses", key: "nav.warehouses", icon: Warehouse, mod: "warehouses", group: "master" },
  { to: "/branches", key: "nav.branches", icon: GitBranch, mod: "branches", group: "master" },
  { to: "/subscription", key: "nav.subscription", icon: CreditCard, mod: "subscription", group: "admin" },
  { to: "/suppliers", key: "nav.suppliers", icon: Truck, mod: "suppliers", group: "master" },
  { to: "/customers", key: "nav.customers", icon: Users, mod: "customers", group: "master" },
  { to: "/finance", key: "nav.finance", icon: Wallet, mod: "reports", group: "finance", perm: "finance.view" },
  { to: "/reports", key: "nav.reports", icon: BarChart3, mod: "reports", group: "intel" },
  { to: "/assistant", key: "nav.assistant", icon: Sparkles, mod: "assistant", group: "intel" },
  { to: "/notifications", key: "nav.notifications", icon: Bell, mod: "notifications", group: "intel" },
  { to: "/team", key: "nav.team", icon: Shield, mod: "team", group: "admin" },
  { to: "/industry", key: "nav.industry", icon: Factory, mod: "industry", group: "admin" },
  { to: "/settings", key: "nav.settings", icon: Settings, mod: "settings", group: "admin" },
];

const CURRENCIES = ["EGP", "SAR", "AED", "USD", "EUR", "GBP", "KWD", "QAR", "BHD", "OMR", "JOD", "LBP", "IQD", "YER", "SYP", "ILS", "MAD", "DZD", "TND", "LYD", "SDG", "MRU", "SOS", "DJF", "KMF"];
const COUNTRY_OPTIONS: { code: string; ar: string; en: string; currency: string; timezone: string }[] = [
  { code: "EG", ar: "مصر", en: "Egypt", currency: "EGP", timezone: "Africa/Cairo" },
  { code: "SA", ar: "السعودية", en: "Saudi Arabia", currency: "SAR", timezone: "Asia/Riyadh" },
  { code: "AE", ar: "الإمارات", en: "United Arab Emirates", currency: "AED", timezone: "Asia/Dubai" },
  { code: "KW", ar: "الكويت", en: "Kuwait", currency: "KWD", timezone: "Asia/Kuwait" },
  { code: "QA", ar: "قطر", en: "Qatar", currency: "QAR", timezone: "Asia/Qatar" },
  { code: "BH", ar: "البحرين", en: "Bahrain", currency: "BHD", timezone: "Asia/Bahrain" },
  { code: "OM", ar: "عُمان", en: "Oman", currency: "OMR", timezone: "Asia/Muscat" },
  { code: "JO", ar: "الأردن", en: "Jordan", currency: "JOD", timezone: "Asia/Amman" },
  { code: "LB", ar: "لبنان", en: "Lebanon", currency: "LBP", timezone: "Asia/Beirut" },
  { code: "IQ", ar: "العراق", en: "Iraq", currency: "IQD", timezone: "Asia/Baghdad" },
  { code: "YE", ar: "اليمن", en: "Yemen", currency: "YER", timezone: "Asia/Aden" },
  { code: "SY", ar: "سوريا", en: "Syria", currency: "SYP", timezone: "Asia/Damascus" },
  { code: "PS", ar: "فلسطين", en: "Palestine", currency: "ILS", timezone: "Asia/Hebron" },
  { code: "MA", ar: "المغرب", en: "Morocco", currency: "MAD", timezone: "Africa/Casablanca" },
  { code: "DZ", ar: "الجزائر", en: "Algeria", currency: "DZD", timezone: "Africa/Algiers" },
  { code: "TN", ar: "تونس", en: "Tunisia", currency: "TND", timezone: "Africa/Tunis" },
  { code: "LY", ar: "ليبيا", en: "Libya", currency: "LYD", timezone: "Africa/Tripoli" },
  { code: "SD", ar: "السودان", en: "Sudan", currency: "SDG", timezone: "Africa/Khartoum" },
  { code: "MR", ar: "موريتانيا", en: "Mauritania", currency: "MRU", timezone: "Africa/Nouakchott" },
  { code: "SO", ar: "الصومال", en: "Somalia", currency: "SOS", timezone: "Africa/Mogadishu" },
  { code: "DJ", ar: "جيبوتي", en: "Djibouti", currency: "DJF", timezone: "Africa/Djibouti" },
  { code: "KM", ar: "جزر القمر", en: "Comoros", currency: "KMF", timezone: "Indian/Comoro" },
];
const ZONES = Array.from(new Set([...COUNTRY_OPTIONS.map((country) => country.timezone), "Europe/London", "UTC"]));

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("ss-theme") === "dark") document.documentElement.classList.add("dark");
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("ss-theme", next ? "dark" : "light");
    setDark(next);
  };
  return { dark, toggle };
}

export function Shell({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <div className="h-8 w-40 animate-pulse rounded-md bg-surface-2" />
      </div>
    );
  }
  if (!user) return <AuthScreen />;
  return <Workspace>{children}</Workspace>;
}

export function AuthScreen() {
  const [lang, setLang] = useState<Lang>("ar");
  const t = (k: string) => translate(lang, k);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);
  const submit = async () => {
    setErr("");
    const fn = mode === "up" ? authClient.signUp.email : authClient.signIn.email;
    const res = await fn({ email, password, name: name || email, callbackURL: "/" });
    if (res.error) setErr(t("auth.fail"));
    else window.location.href = "/";
  };
  return (
    <div className="min-h-screen bg-canvas text-ink" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-5 py-8 lg:grid-cols-2">
        <div>
          <div className="mb-6 flex items-center gap-3">
            <img src="/favicon.svg" alt="" className="h-10 w-10 rounded-lg" />
            <div>
              <div className="text-sm font-semibold">{t("brand.mark")}</div>
              <div className="text-xs text-muted">{t("brand.tag")}</div>
            </div>
          </div>
          <p className="max-w-md text-base leading-relaxed">{t("entrance.lead")}</p>
          <ul className="mt-6 space-y-3 text-sm text-muted">
            <li>{t("entrance.point1")}</li>
            <li>{t("entrance.point2")}</li>
            <li>{t("entrance.point3")}</li>
          </ul>
        </div>
        <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
          <div className="mb-4 flex justify-end">
            <button type="button" className="text-xs text-muted" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
              {lang === "ar" ? "English" : "العربية"}
            </button>
          </div>
          <div className="space-y-2">
            {GROK_PROVIDERS.map((p) => (
              <Button key={p.providerId} variant="quiet" className="w-full" onClick={() => void signIn(p.providerId, { callbackURL: "/" })}>
                {p.idp === "google" ? t("auth.google") : t("auth.x")}
              </Button>
            ))}
          </div>
          <p className="my-4 text-center text-xs text-muted">{t("auth.or")}</p>
          <div className="space-y-3">
            {mode === "up" ? (
              <Field label={t("auth.name")}>
                <TextInput value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            ) : null}
            <Field label={t("auth.email")}>
              <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </Field>
            <Field label={t("auth.password")}>
              <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "up" ? "new-password" : "current-password"} />
            </Field>
            {err ? <p className="text-sm text-danger">{err}</p> : null}
            <Button className="w-full" onClick={() => void submit()}>
              {mode === "up" ? t("auth.signUp") : t("auth.signIn")}
            </Button>
            <button type="button" className="w-full text-center text-sm text-teal" onClick={() => setMode(mode === "up" ? "in" : "up")}>
              {mode === "up" ? t("auth.have") : t("auth.new")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const [lang, setLang] = useState<Lang>("ar");
  const t = (k: string) => translate(lang, k);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("general");
  const [countryCode, setCountryCode] = useState("EG");
  const [currency, setCurrency] = useState("EGP");
  const [timezone, setTimezone] = useState("Africa/Cairo");
  const [locale, setLocale] = useState<Lang>("ar");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async (demo: boolean) => {
    if (!name.trim()) return setErr(t("common.required"));
    setBusy(true);
    const res = await createOrganization({ data: { name, industry, countryCode, currency, timezone, locale, demo } });
    setBusy(false);
    if (!res.ok) setErr(t(`err.${res.error}`));
    else onDone();
  };
  return (
    <div className="mx-auto max-w-xl px-4 py-10" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-md" />
          <span className="font-semibold">{t("brand.mark")}</span>
        </div>
        <button type="button" className="text-xs text-muted" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>{lang === "ar" ? "EN" : "ع"}</button>
      </div>
      <h1 className="text-lg font-semibold">{t("onboard.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("onboard.lead")}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field label={t("onboard.name")}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("onboard.industry")}>
          <SelectInput value={industry} onChange={(e) => setIndustry(e.target.value)}>
            {INDUSTRIES.map((id) => (
              <option key={id} value={id}>{t(`industry.${id}`)}</option>
            ))}
          </SelectInput>
        </Field>
        <Field label={t("onboard.country")}>
          <SelectInput value={countryCode} onChange={(e) => {
            const selected = COUNTRY_OPTIONS.find((country) => country.code === e.target.value);
            if (!selected) return;
            setCountryCode(selected.code);
            setCurrency(selected.currency);
            setTimezone(selected.timezone);
          }}>
            {COUNTRY_OPTIONS.map((country) => <option key={country.code} value={country.code}>{lang === "ar" ? country.ar : country.en}</option>)}
          </SelectInput>
        </Field>
        <Field label={t("onboard.currency")}>
          <SelectInput value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </SelectInput>
        </Field>
        <Field label={t("onboard.timezone")}>
          <SelectInput value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {ZONES.map((z) => <option key={z}>{z}</option>)}
          </SelectInput>
        </Field>
        <Field label={t("onboard.locale")}>
          <SelectInput value={locale} onChange={(e) => setLocale(e.target.value as Lang)}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </SelectInput>
        </Field>
      </div>
      {err ? <p className="mt-3 text-sm text-danger">{err}</p> : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void go(false)}>{t("onboard.create")}</Button>
        <Button variant="quiet" disabled={busy} onClick={() => void go(true)}>{t("onboard.demo")}</Button>
      </div>
      <p className="mt-2 text-xs text-muted">{t("onboard.demoHint")}</p>
    </div>
  );
}

function Workspace({ children }: { children: ReactNode }) {
  const [orgs, setOrgs] = useState<OrgRecord[] | null>(null);
  const [orgId, setOrgIdState] = useState<string | null>(null);
  const [lang, setLangState] = useState<Lang>("ar");
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState(0);
  const [platformRole, setPlatformRole] = useState<string | null>(null);
  const theme = useTheme();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const load = useCallback(() => {
    getWorkspace()
      .then((rows) => {
        setOrgs(rows);
        const saved = localStorage.getItem("ss-org");
        const next = rows.find((o) => o.id === saved)?.id ?? rows[0]?.id ?? null;
        setOrgIdState(next);
        if (next) localStorage.setItem("ss-org", next);
      })
      .catch(() => setOrgs([]));
  }, []);

  useEffect(() => {
    load();
    let live = true;
    getPlatformAdminStatus().then((role) => { if (live) setPlatformRole(role); }).catch(() => { if (live) setPlatformRole(null); });
    const stored = localStorage.getItem("ss-lang");
    if (stored === "en" || stored === "ar") setLangState(stored);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    setQueue(readQueue().length);
    return () => {
      live = false;
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [load]);

  const org = orgs?.find((o) => o.id === orgId) ?? orgs?.[0];
  const langEff = org ? lang : lang;

  useEffect(() => {
    document.documentElement.lang = langEff;
    document.documentElement.dir = langEff === "ar" ? "rtl" : "ltr";
  }, [langEff]);

  const flush = useCallback(async () => {
    const items = readQueue();
    const left = [];
    for (const item of items) {
      try {
        const saved = await saveDocument({ data: item });
        if (!saved.ok || !saved.id) {
          left.push(item);
          continue;
        }
        const posted = await postDocument({ data: { orgId: item.orgId, id: saved.id } });
        if (!posted.ok && posted.error !== "NOT_DRAFT") left.push(item);
      } catch {
        left.push(item);
      }
    }
    localStorage.setItem("ss-outbox", JSON.stringify(left));
    localStorage.setItem("ss-sync", new Date().toISOString());
    setQueue(left.length);
  }, []);

  useEffect(() => {
    if (online) void flush();
  }, [online, flush]);

  if (!orgs) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="h-8 w-48 animate-pulse rounded-md bg-surface-2" />
      </div>
    );
  }
  if (!org) return <Onboarding onDone={load} />;

  const t = (key: string) => translate(lang, key);
  const allowed = (perm: Perm) => can(org.role, org.grants, org.revokes, perm);
  const modules = modulesFor(org.industry, org.settings);
  const mobileNavItems = ["/", "/sales", "/inventory", "/products", ...NAV.map((item) => item.to)]
    .map((to) => NAV.find((item) => item.to === to))
    .filter((item): item is (typeof NAV)[number] => Boolean(item && modules.includes(item.mod) && (!item.perm || allowed(item.perm))))
    .filter((item, index, rows) => rows.findIndex((row) => row.to === item.to) === index)
    .slice(0, 4);
  const searchableNav = NAV.filter((item) => modules.includes(item.mod) && (!item.perm || allowed(item.perm))).filter((item) => {
    const label = item.mod === "customers" && org.industry === "construction" ? t("nav.customersProject") : t(item.key);
    return `${label} ${item.to}`.toLowerCase().includes(searchQuery.trim().toLowerCase());
  });
  const primaryActionTo = modules.includes("sales") ? "/sales" : "/movements";
  const currentNav = [...NAV].sort((a, b) => b.to.length - a.to.length).find((item) => item.to === "/" ? path === "/" : path.startsWith(item.to));
  const currentPageLabel = currentNav
    ? currentNav.mod === "customers" && org.industry === "construction" ? t("nav.customersProject") : t(currentNav.key)
    : t("brand.name");
  const ctx: AppCtx = {
    lang,
    setLang: (l) => {
      setLangState(l);
      localStorage.setItem("ss-lang", l);
    },
    t,
    org,
    orgs,
    setOrgId: (id) => {
      setOrgIdState(id);
      localStorage.setItem("ss-org", id);
    },
    reload: load,
    allowed,
    modules,
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className="min-h-screen bg-canvas text-ink" dir={lang === "ar" ? "rtl" : "ltr"}>
        <div className="flex min-h-screen">
          <aside className={`workspace-sidebar no-print sticky top-0 hidden h-screen shrink-0 flex-col text-sidebar-fg lg:flex ${collapsed ? "is-collapsed" : ""}`}>
            <SidebarBody t={t} org={org} orgs={orgs} setOrgId={ctx.setOrgId} modules={modules} path={path} collapsed={collapsed} industry={org.industry} platformRole={platformRole} allowed={allowed} />
            <button type="button" className="sidebar-collapse no-print" onClick={() => setCollapsed((v) => !v)} title={collapsed ? (lang === "ar" ? "توسيع القائمة" : "Expand sidebar") : (lang === "ar" ? "طي القائمة" : "Collapse sidebar")}>
              <ChevronDown className={`transition-transform ${collapsed ? "rotate-90" : "-rotate-90"}`} />
              {!collapsed ? <span>{lang === "ar" ? "طي القائمة" : "Collapse menu"}</span> : null}
            </button>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="workspace-header no-print sticky top-0 z-20 flex items-center gap-2 px-3 sm:px-5">
              <button type="button" className="workspace-icon-button lg:hidden" onClick={() => setOpen(true)} aria-label="menu">
                <Menu className="h-5 w-5" />
              </button>
              <div className="workspace-org min-w-0 flex-1">
                <strong>{org.name}</strong>
                <span className="hidden sm:block">{currentPageLabel} <span className="mx-1 opacity-50">/</span> {t("brand.tag")}</span>
              </div>
              <button type="button" onClick={() => setSearchOpen(true)} className="workspace-search" aria-label={lang === "ar" ? "بحث شامل" : "Global search"}>
                <span className="flex items-center gap-2 text-xs"><Search className="h-4 w-4" /><span className="hidden sm:inline">{lang === "ar" ? "ابحث في النظام..." : "Search workspace..."}</span></span>
                <kbd className="hidden sm:inline-flex">⌘ K</kbd>
              </button>
              <Link to={primaryActionTo} className="workspace-create hidden sm:inline-flex">
                <Plus className="h-4 w-4" />{lang === "ar" ? "عملية جديدة" : "New transaction"}
              </Link>
              <span className={`workspace-status hidden sm:inline-flex ${online ? "is-online" : "is-offline"}`}>
                {online ? (queue ? `${queue} ${lang === "ar" ? "معلقة" : "queued"}` : t("common.online")) : t("common.offline")}
              </span>
              {queue > 0 && online ? <Button variant="quiet" className="hidden sm:inline-flex" onClick={() => void flush()}>{t("common.syncNow")}</Button> : null}
              <button type="button" className="workspace-icon-button" onClick={() => ctx.setLang(lang === "ar" ? "en" : "ar")} aria-label="language"><span className="text-[11px] font-bold">{lang === "ar" ? "EN" : "ع"}</span></button>
              <button type="button" className="workspace-icon-button" onClick={theme.toggle} aria-label="theme">
                {theme.dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <Link to="/notifications" className="workspace-icon-button relative" aria-label={t("nav.notifications")}>
                <Bell className="h-4 w-4" />
              </Link>
              <UserButton />
            </header>
            {!online ? <div className="bg-warning-soft px-4 py-2 text-xs text-warning">{t("common.offline")}</div> : null}
            {org.demoSeeded ? <div className="border-b border-line bg-teal-soft px-4 py-2 text-xs text-teal">{t("common.demo")}</div> : null}
            <main className="workspace-main flex-1 pb-24 lg:pb-7">{children}</main>
          </div>
        </div>
        {open ? (
          <div className="fixed inset-0 z-30 lg:hidden">
            <button className="absolute inset-0 bg-navy/50" onClick={() => setOpen(false)} aria-label="close" />
            <div className="mobile-drawer-panel absolute inset-y-0 start-0 flex flex-col bg-sidebar text-sidebar-fg">
              <button type="button" className="workspace-icon-button m-3 self-end text-sidebar-fg hover:bg-white/10 hover:text-white" onClick={() => setOpen(false)} aria-label="close"><X className="h-5 w-5" /></button>
              <SidebarBody t={t} org={org} orgs={orgs} setOrgId={ctx.setOrgId} modules={modules} path={path} collapsed={false} industry={org.industry} platformRole={platformRole} allowed={allowed} onNav={() => setOpen(false)} />
            </div>
          </div>
        ) : null}
        <nav className="mobile-bottom-nav no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 pb-[env(safe-area-inset-bottom)] lg:hidden">
          {mobileNavItems.map((item) => {
            const to = item.to;
            const active = to === "/" ? path === "/" : path.startsWith(to);
            return <Link key={to} to={to} className={`mobile-bottom-link ${active ? "is-active" : ""}`}>
              <span className="mobile-bottom-link-icon"><item.icon className="h-[18px] w-[18px]" /></span>
              {t(item.key)}
            </Link>;
          })}
          <button type="button" className="mobile-bottom-link" onClick={() => setOpen(true)}>
            <span className="mobile-bottom-link-icon"><Menu className="h-[18px] w-[18px]" /></span>
            {t("common.more")}
          </button>
        </nav>
        {searchOpen ? (
          <div className="ui-modal-backdrop fixed inset-0 z-50 flex items-start justify-center px-3 pt-[12vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
            <section role="dialog" aria-modal="true" aria-label={lang === "ar" ? "البحث في النظام" : "Workspace search"} className="ui-modal-card w-full max-w-xl overflow-hidden">
              <div className="flex items-center gap-3 border-b border-line px-4 py-1">
                <Search className="h-5 w-5 text-muted" />
                <input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={lang === "ar" ? "ابحث عن صفحة أو وظيفة..." : "Search pages and tools..."} className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none" />
                <button type="button" onClick={() => setSearchOpen(false)} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="close"><X className="h-4 w-4" /></button>
              </div>
              <div className="max-h-[55vh] overflow-auto p-2">
                {searchableNav.map((item) => {
                  const label = item.mod === "customers" && org.industry === "construction" ? t("nav.customersProject") : t(item.key);
                  return <Link key={item.to} to={item.to} onClick={() => { setSearchOpen(false); setSearchQuery(""); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition hover:bg-surface-2"><item.icon className="h-4 w-4 text-teal" /><span className="flex-1">{label}</span><span className="text-[10px] text-muted">{item.to}</span></Link>;
                })}
                {searchableNav.length === 0 ? <p className="px-3 py-8 text-center text-sm text-muted">{lang === "ar" ? "لا توجد نتائج مطابقة" : "No matching pages"}</p> : null}
              </div>
              <div className="flex items-center justify-between border-t border-line bg-surface-2 px-4 py-2 text-[10px] text-muted"><span>{lang === "ar" ? "التنقل السريع داخل النظام" : "Quick workspace navigation"}</span><span>ESC</span></div>
            </section>
          </div>
        ) : null}
      </div>
    </Ctx.Provider>
  );
}

function SidebarBody({
  t, org, orgs, setOrgId, modules, path, collapsed, industry, platformRole, allowed, onNav,
}: {
  t: (k: string) => string;
  org: OrgRecord;
  orgs: OrgRecord[];
  setOrgId: (id: string) => void;
  modules: ModuleId[];
  path: string;
  collapsed: boolean;
  industry: string;
  platformRole?: string | null;
  allowed: (perm: Perm) => boolean;
  onNav?: () => void;
}) {
  const groups = ["work", "master", "finance", "intel", "admin"];
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({ work: true, master: true, finance: true, intel: true, admin: true });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark"><img src="/favicon.svg" alt="" /></span>
        {!collapsed ? (
          <div className="sidebar-brand-copy">
            <strong>{t("brand.name")}</strong>
            <span>INTELLIGENT BUSINESS</span>
          </div>
        ) : null}
      </div>
      {!collapsed ? (
        <label className="sidebar-org-wrap">
          <span className="sidebar-org-label">{t("brand.tag")}</span>
          <select className="sidebar-org-select" value={org.id} onChange={(e) => setOrgId(e.target.value)}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      ) : null}
      <div className="sidebar-nav-scroll">
        {groups.map((g) => (
          <div key={g} className="sidebar-group">
            {!collapsed ? <button type="button" onClick={() => setGroupOpen((current) => ({ ...current, [g]: !current[g] }))} className="sidebar-group-trigger"><span>{t(`nav.group.${g}`)}</span><ChevronDown className={`h-3.5 w-3.5 transition-transform ${groupOpen[g] ? "" : "-rotate-90"}`} /></button> : null}
            {(collapsed || groupOpen[g]) ? NAV.filter((n) => n.group === g && modules.includes(n.mod) && (!n.perm || allowed(n.perm))).map((n) => {
              const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
              const label = n.mod === "customers" && industry === "construction" ? t("nav.customersProject") : t(n.key);
              return (
                <Link key={n.to} to={n.to} onClick={onNav} title={collapsed ? label : undefined} aria-current={active ? "page" : undefined} className={`sidebar-link ${collapsed ? "is-collapsed" : ""} ${active ? "is-active" : ""}`}>
                  <n.icon />
                  {!collapsed ? <span className="truncate">{label}</span> : null}
                </Link>
              );
            }) : null}
          </div>
        ))}
        {platformRole ? <Link to="/platform" onClick={onNav} className={`sidebar-link sidebar-platform-link ${path.startsWith("/platform") ? "is-active" : ""} ${collapsed ? "is-collapsed" : ""}`} title={collapsed ? t("nav.platform") : undefined}>
          <Shield />{!collapsed ? <span className="truncate">{t("nav.platform")}</span> : null}
        </Link> : null}
      </div>
    </div>
  );
}

export function queueMovement(payload: Parameters<typeof saveDocument>[0]["data"]) {
  const q = readQueue();
  q.push(payload);
  localStorage.setItem("ss-outbox", JSON.stringify(q));
}

function readQueue(): Parameters<typeof saveDocument>[0]["data"][] {
  try {
    const raw = localStorage.getItem("ss-outbox");
    return raw ? (JSON.parse(raw) as Parameters<typeof saveDocument>[0]["data"][]) : [];
  } catch {
    return [];
  }
}

export function errText(t: (k: string) => string, code?: string) {
  if (!code) return t("common.error");
  const key = `err.${code}`;
  const msg = t(key);
  return msg === key ? t("common.error") : msg;
}
