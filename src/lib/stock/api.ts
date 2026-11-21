import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { INDUSTRY_FIELDS, UNIT_SEEDS } from "./industries";
import { can, type Perm } from "./permissions";
import type { DocInput, OrgSettings, ProductInput } from "./types";
import { planLimitExceeded } from "./entitlements";
import { majorAmountToMinor } from "./pricing";
import { financeAmountUnits, financeUnitsToDecimal } from "./finance-money";
import { callGemini } from "./gemini.server";

type Gate = {
  role: string;
  grants: unknown;
  revokes: unknown;
  name: string;
  industry: string;
  currency: string;
  timezone: string;
  locale: string;
  tax_rate: string;
  allow_negative: boolean;
  expiry_warn_days: number;
  slow_days: number;
  demo_seeded: boolean;
  settings: unknown;
};

function text(v: unknown, max = 240) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function uuid(v: unknown): string | null {
  return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}
function jarr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v) as unknown;
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}
function jobj(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  return {};
}
function biz(e: unknown): { ok: false; error: string } | null {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/SS:([A-Z0-9_]+)/);
  if (m) return { ok: false, error: m[1] };
  if (msg.includes("branches_org_id_code")) return { ok: false, error: "BRANCH_CODE" };
  if (msg.includes("products_org_id_sku") || msg.includes("units_org_id_code") || msg.includes("warehouses_org_id_code")) {
    return { ok: false, error: "SKU" };
  }
  return null;
}
async function enforcePlanLimit(sql: Sql, orgId: string, limitKey: string, currentUsage: number) {
  // Limits are data-driven: no commercial limits are invented in application
  // code. Until a plan owner configures a positive value, that dimension is
  // intentionally unrestricted and is visible as not configured in billing.
  const rows = await sql.query<{ limitValue: string | null }>(
    `select coalesce(fo.limit_value, case
       when (p.limits ->> $2) ~ '^[0-9]+(\.[0-9]+)?$' then (p.limits ->> $2)::numeric
       else null end)::text as "limitValue"
     from saas_subscriptions s
     join saas_plans p on p.id = s.plan_id
     left join saas_feature_overrides fo on fo.org_id = s.org_id
       and fo.feature_key = $2 and (fo.expires_at is null or fo.expires_at > now())
     where s.org_id = $1::uuid
       and s.status in ('trialing', 'active', 'past_due', 'paused')
     order by s.created_at desc limit 1`,
    [orgId, limitKey],
  );
  const configured = rows[0]?.limitValue;
  if (configured === null || configured === undefined) return;
  if (planLimitExceeded(configured, currentUsage)) {
    throw new Error(`SS:PLAN_LIMIT_${limitKey.toUpperCase()}`);
  }
}

async function gate(sql: Sql, userId: string, orgId: string, perm: Perm) {
  const id = uuid(orgId);
  if (!id) throw new Error("VALIDATION");
  const rows = await sql<Gate>`
    select m.role, m.grants, m.revokes, o.name, o.industry, o.currency, o.timezone, o.locale,
           o.tax_rate::text as tax_rate, o.allow_negative, o.expiry_warn_days, o.slow_days,
           o.demo_seeded, o.settings
    from memberships m
    join organizations o on o.id = m.org_id
    where m.org_id = ${id}::uuid and m.user_id = ${userId}
  `;
  const row = rows[0];
  if (!row || !can(row.role, jarr(row.grants), jarr(row.revokes), perm)) throw new Error("FORBIDDEN");
  return row;
}
function mapOrg(row: Gate & { id: string }) {
  const settings = jobj(row.settings) as OrgSettings;
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    currency: row.currency,
    timezone: row.timezone,
    locale: row.locale,
    taxRate: row.tax_rate,
    allowNegative: row.allow_negative,
    expiryWarnDays: row.expiry_warn_days,
    slowDays: row.slow_days,
    demoSeeded: row.demo_seeded,
    settings,
    role: row.role,
    grants: jarr(row.grants),
    revokes: jarr(row.revokes),
  };
}

async function audit(sql: Sql, orgId: string, userId: string, action: string, entity: string, entityId: string, detail: unknown = {}) {
  await sql`insert into audit_log (org_id, user_id, action, entity, entity_id, detail)
    values (${orgId}::uuid, ${userId}, ${action}, ${entity}, ${entityId}, ${JSON.stringify(detail)}::jsonb)`;
}

export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<Gate & { id: string }>`
      select o.id::text as id, m.role, m.grants, m.revokes, o.name, o.industry, o.currency, o.timezone, o.locale,
             o.tax_rate::text as tax_rate, o.allow_negative, o.expiry_warn_days, o.slow_days, o.demo_seeded, o.settings
      from memberships m
      join organizations o on o.id = m.org_id
      where m.user_id = ${context.userId}
      order by o.created_at
    `;
    return rows.map(mapOrg);
  });

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; industry: string; currency: string; timezone: string; locale: string; countryCode?: string; demo?: boolean }) => input)
  .handler(async ({ context, data }) => {
    const name = text(data.name, 160);
    if (!name) return { ok: false as const, error: "VALIDATION" };
    const sql = await getSql();
    const industry = text(data.industry, 40) || "general";
    const countryCode = text(data.countryCode, 2).toUpperCase().match(/^[A-Z]{2}$/)?.[0] || "EG";
    const regionalCurrency: Record<string, string> = {
      EG: "EGP", SA: "SAR", AE: "AED", KW: "KWD", QA: "QAR", BH: "BHD",
      OM: "OMR", JO: "JOD", LB: "LBP", IQ: "IQD", YE: "YER", SY: "SYP",
      PS: "ILS", MA: "MAD", DZ: "DZD", TN: "TND", LY: "LYD", SD: "SDG",
      MR: "MRU", SO: "SOS", DJ: "DJF", KM: "KMF",
    };
    const currency = text(data.currency, 8).toUpperCase() || regionalCurrency[countryCode] || "EGP";
    const regionalTimezone: Record<string, string> = {
      EG: "Africa/Cairo", SA: "Asia/Riyadh", AE: "Asia/Dubai", KW: "Asia/Kuwait",
      QA: "Asia/Qatar", BH: "Asia/Bahrain", OM: "Asia/Muscat", JO: "Asia/Amman",
      LB: "Asia/Beirut", IQ: "Asia/Baghdad", YE: "Asia/Aden", SY: "Asia/Damascus",
      PS: "Asia/Hebron", MA: "Africa/Casablanca", DZ: "Africa/Algiers", TN: "Africa/Tunis",
      LY: "Africa/Tripoli", SD: "Africa/Khartoum", MR: "Africa/Nouakchott",
      SO: "Africa/Mogadishu", DJ: "Africa/Djibouti", KM: "Indian/Comoro",
    };
    const timezone = text(data.timezone, 64) || regionalTimezone[countryCode] || "Africa/Cairo";
    const locale = data.locale === "en" ? "en" : "ar";

    // Organization, owner membership, defaults, trial, and optional demo data
    // are committed together. A failed seed can no longer leave a partial tenant.
    const created = await sql.transaction(async (tx) => {
      const rows = await tx<{ id: string }>`
        insert into organizations (name, industry, currency, timezone, locale, country_code, created_by)
        values (${name}, ${industry}, ${currency}, ${timezone}, ${locale}, ${countryCode}, ${context.userId})
        returning id::text as id
      `;
      const orgId = rows[0].id;
      await tx`insert into memberships (org_id, user_id, role)
        values (${orgId}::uuid, ${context.userId}, 'owner')`;

      // The new tenant is added to the transaction-local RLS scope only after
      // its owner membership has been created and verified by the server.
      await tx`select set_config('app.org_ids', ${orgId}, true)`;
      await tx`insert into branches (org_id, code, name_ar, name_en, is_default)
        values (${orgId}::uuid, 'MAIN', 'الفرع الرئيسي', 'Main branch', true)`;

      for (const u of UNIT_SEEDS) {
        await tx`insert into units (org_id, code, name_ar, name_en, dimension)
          values (${orgId}::uuid, ${u.code}, ${u.nameAr}, ${u.nameEn}, ${u.dimension})`;
      }
      await tx`insert into categories (org_id, name_ar, name_en)
        values (${orgId}::uuid, 'عام', 'General')`;
      const fields = INDUSTRY_FIELDS[industry] ?? [];
      for (const [i, f] of fields.entries()) {
        await tx`insert into custom_fields (org_id, entity, key, label_ar, label_en, field_type, options, sort)
          values (${orgId}::uuid, 'product', ${f.key}, ${f.labelAr}, ${f.labelEn}, ${f.fieldType}, ${JSON.stringify(f.options ?? [])}::jsonb, ${i})
          on conflict (org_id, entity, key) do nothing`;
      }

      const trial = await tx<{ id: string; trial_ends_at: string }>`
        insert into saas_subscriptions (
          org_id, plan_id, status, billing_cycle, trial_started_at, trial_ends_at,
          current_period_start, current_period_end
        )
        select ${orgId}::uuid, p.id, 'trialing', 'trial', now(), now() + interval '14 days',
               now(), now() + interval '14 days'
        from saas_plans p where p.code = 'trial'
        returning id::text as id, trial_ends_at::text as trial_ends_at
      `;
      if (!trial[0]) throw new Error("SAAS_TRIAL_PLAN_MISSING");

      await audit(tx, orgId, context.userId, "create", "organization", orgId, { name, trialDays: 14 });
      await ensureFinanceAccounts(tx, orgId);
      if (data.demo) await seedOrg(tx, orgId, context.userId);
      return { id: orgId, trialEndsAt: trial[0].trial_ends_at };
    });
    return { ok: true as const, id: created.id, trialEndsAt: created.trialEndsAt };
  });

async function seedOrg(sql: Sql, orgId: string, userId: string) {
  const unit = await sql<{ id: string }>`select id::text as id from units where org_id = ${orgId}::uuid and code = 'pcs'`;
  const unitId = unit[0]?.id;
  const wh1 = await sql<{ id: string }>`insert into warehouses (org_id, code, name_ar, name_en, city) values (${orgId}::uuid, 'MAIN', 'المخزن الرئيسي', 'Main warehouse', 'Cairo') returning id::text as id`;
  const wh2 = await sql<{ id: string }>`insert into warehouses (org_id, code, name_ar, name_en, city) values (${orgId}::uuid, 'BR2', 'مخزن الفرع', 'Branch warehouse', 'Giza') returning id::text as id`;
  const sup = await sql<{ id: string }>`insert into suppliers (org_id, code, name_ar, name_en, phone, city) values (${orgId}::uuid, 'SUP-1', 'مورد النيل', 'Nile Supply', '01000000000', 'Cairo') returning id::text as id`;
  await sql`insert into customers (org_id, code, kind, name_ar, name_en) values (${orgId}::uuid, 'CUS-1', 'customer', 'عميل تجريبي', 'Sample customer')`;
  const cat = await sql<{ id: string }>`select id::text as id from categories where org_id = ${orgId}::uuid limit 1`;
  const mk = async (sku: string, arName: string, enName: string, reorder: number, price: number, extra: { expiry?: boolean } = {}) => {
    const r = await sql<{ id: string }>`
      insert into products (org_id, sku, name_ar, name_en, category_id, base_unit_id, price, reorder_point, supplier_id, track_expiry, track_batch, status)
      values (${orgId}::uuid, ${sku}, ${arName}, ${enName}, ${cat[0]?.id ?? null}::uuid, ${unitId}::uuid, ${price}, ${reorder}, ${sup[0].id}::uuid, ${Boolean(extra.expiry)}, ${Boolean(extra.expiry)}, 'active')
      returning id::text as id`;
    return r[0].id;
  };
  const paper = await mk("PPR-A4", "ورق A4", "A4 paper", 20, 85);
  const ink = await mk("INK-01", "حبر طابعة", "Printer ink", 8, 140);
  const chair = await mk("CHR-01", "كرسي مكتبي", "Office chair", 2, 2400);
  const coffee = await mk("COF-1", "بن محوج", "Coffee beans", 5, 180, { expiry: true });
  await mk("CBL-5", "كابل شبكة", "Network cable", 10, 45);
  const post = async (docType: string, wh: string, lines: { productId: string; qty: number; unitCost?: number; batchNo?: string; expiry?: string }[]) => {
    const saved = await sql<{ id: string }>`select ss_save_document(${orgId}::uuid, ${userId}, ${JSON.stringify({ docType, warehouseId: wh, lines })}::jsonb)::text as id`;
    await sql`select ss_post_document(${orgId}::uuid, ${saved[0].id}::uuid, ${userId})`;
  };
  await post("opening", wh1[0].id, [
    { productId: paper, qty: 40, unitCost: 60 },
    { productId: ink, qty: 3, unitCost: 90 },
    { productId: coffee, qty: 12, unitCost: 110, batchNo: "B-2401", expiry: "2026-12-01" },
    { productId: chair, qty: 1, unitCost: 1800 },
  ]);
  await post("issue", wh1[0].id, [{ productId: paper, qty: 6 }]);
  await post("issue", wh1[0].id, [{ productId: chair, qty: 1 }]);
  const po = await sql<{ id: string }>`
    select ss_save_purchase(${orgId}::uuid, ${userId}, ${JSON.stringify({
      supplierId: sup[0].id,
      warehouseId: wh1[0].id,
      notes: "sample",
      lines: [{ productId: ink, qty: 10, unitPrice: 95 }],
    })}::jsonb)::text as id`;
  await sql`select ss_set_po_status(${orgId}::uuid, ${po[0].id}::uuid, ${userId}, 'approved')`;
  await sql`insert into locations (org_id, warehouse_id, code, name) values (${orgId}::uuid, ${wh2[0].id}::uuid, 'A1', 'رف A1')`;
  await sql`update organizations set demo_seeded = true where id = ${orgId}::uuid`;
}

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ context, data }) => {
    const orgId = uuid(data.orgId);
    if (!orgId) return { ok: false as const, error: "VALIDATION" };
    const sql = await getSql();
    const current = await gate(sql, context.userId, orgId, "settings.write");
    const settings = { ...jobj(current.settings), ...(jobj(data.settings) as OrgSettings) };
    await sql`
      update organizations set
        name = ${text(data.name, 160) || current.name},
        industry = ${text(data.industry, 40) || current.industry},
        currency = ${text(data.currency, 8) || current.currency},
        timezone = ${text(data.timezone, 64) || current.timezone},
        locale = ${data.locale === "en" ? "en" : data.locale === "ar" ? "ar" : current.locale},
        tax_rate = ${num(data.taxRate) ?? Number(current.tax_rate)},
        allow_negative = ${typeof data.allowNegative === "boolean" ? data.allowNegative : current.allow_negative},
        expiry_warn_days = ${num(data.expiryWarnDays) ?? current.expiry_warn_days},
        slow_days = ${num(data.slowDays) ?? current.slow_days},
        settings = ${JSON.stringify(settings)}::jsonb
      where id = ${orgId}::uuid
    `;
    const industry = text(data.industry, 40) || current.industry;
    for (const [i, f] of (INDUSTRY_FIELDS[industry] ?? []).entries()) {
      await sql`insert into custom_fields (org_id, entity, key, label_ar, label_en, field_type, options, sort)
        values (${orgId}::uuid, 'product', ${f.key}, ${f.labelAr}, ${f.labelEn}, ${f.fieldType}, ${JSON.stringify(f.options ?? [])}::jsonb, ${i})
        on conflict (org_id, entity, key) do nothing`;
    }
    await audit(sql, orgId, context.userId, "update", "organization", orgId, {});
    return { ok: true as const };
  });

export const listMembers = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "products.view");
    return sql<{ userId: string; role: string; grants: unknown; revokes: unknown; email: string; name: string }>`
      select m.user_id as "userId", m.role, m.grants, m.revokes, coalesce(u.email, '') as email, coalesce(u.name, '') as name
      from memberships m
      left join "user" u on u.id = m.user_id
      where m.org_id = ${data.orgId}::uuid
      order by m.created_at
    `;
  });

export const addMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; email: string; role: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "team.write");
    const email = text(data.email, 180).toLowerCase();
    const found = await sql<{ id: string }>`select id from "user" where lower(email) = ${email}`;
    if (!found[0]) return { ok: false as const, error: "NOT_FOUND" };
    await sql.transaction(async (tx) => {
      await tx`select id from organizations where id = ${data.orgId}::uuid for update`;
      const existingMember = await tx<{ exists: boolean }>`select exists(
        select 1 from memberships where org_id = ${data.orgId}::uuid and user_id = ${found[0].id}
      ) as exists`;
      if (!existingMember[0]?.exists) {
        const count = await tx<{ n: number }>`select count(*)::int as n from memberships where org_id = ${data.orgId}::uuid`;
        await enforcePlanLimit(tx, data.orgId, "members", count[0]?.n ?? 0);
      }
      await tx`
        insert into memberships (org_id, user_id, role) values (${data.orgId}::uuid, ${found[0].id}, ${text(data.role, 40) || "viewer"})
        on conflict (org_id, user_id) do update set role = excluded.role
      `;
      await audit(tx, data.orgId, context.userId, "grant", "membership", found[0].id, { role: data.role });
    });
    return { ok: true as const };
  });

export const updateMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; userId: string; role: string; grants: string[]; revokes: string[] }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "team.write");
    if (data.role === "owner") {
      /* owner transfer allowed */
    }
    const owners = await sql<{ n: number }>`select count(*)::int as n from memberships where org_id = ${data.orgId}::uuid and role = 'owner' and user_id <> ${data.userId}`;
    if ((owners[0]?.n ?? 0) === 0 && data.role !== "owner") return { ok: false as const, error: "VALIDATION" };
    await sql`
      update memberships set role = ${text(data.role, 40)}, grants = ${JSON.stringify(data.grants ?? [])}::jsonb, revokes = ${JSON.stringify(data.revokes ?? [])}::jsonb
      where org_id = ${data.orgId}::uuid and user_id = ${data.userId}
    `;
    await audit(sql, data.orgId, context.userId, "update", "membership", data.userId, { role: data.role });
    return { ok: true as const };
  });

function catalog(table: "categories" | "suppliers" | "customers" | "warehouses" | "units") {
  return { table };
}

async function getPlatformRole(sql: Sql, userId: string) {
  const rows = await sql<{ role: string }>`
    select role from saas_platform_admins
    where user_id = ${userId} and enabled = true
    limit 1
  `;
  return rows[0]?.role ?? null;
}

async function requirePlatformAdmin(sql: Sql, userId: string, allowed: string[] = ["super_admin", "operations", "support"]) {
  const role = await getPlatformRole(sql, userId);
  if (!role || !allowed.includes(role)) throw new Error("FORBIDDEN");
  return role;
}

async function platformAudit(sql: Sql, userId: string, action: string, entity: string, entityId: string, detail: unknown = {}) {
  await sql`insert into saas_platform_audit (actor_user_id, action, entity, entity_id, detail)
    values (${userId}, ${action}, ${entity}, ${entityId}, ${JSON.stringify(detail)}::jsonb)`;
}

function cleanPlanLimits(value: unknown) {
  const input = jobj(value);
  const output: Record<string, number> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!/^[a-z][a-zA-Z0-9_]{0,47}$/.test(key)) throw new Error("VALIDATION");
    const limit = num(raw);
    if (limit === null || !Number.isSafeInteger(limit) || limit < 0) throw new Error("VALIDATION");
    output[key] = limit;
  }
  return output;
}

function cleanPlanFeatures(value: unknown) {
  const input = jobj(value);
  const output: Record<string, boolean | number | string> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!/^[a-z][a-zA-Z0-9_]{0,47}$/.test(key)) throw new Error("VALIDATION");
    if (typeof raw === "boolean") output[key] = raw;
    else if (typeof raw === "string" && raw.length <= 160) output[key] = raw;
    else if (typeof raw === "number" && Number.isFinite(raw)) output[key] = raw;
    else throw new Error("VALIDATION");
  }
  return output;
}



export const getPlatformAdminStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return getPlatformRole(sql, context.userId);
  });

export const getPlatformConsole = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const role = await requirePlatformAdmin(sql, context.userId);
    const plans = await sql<{
      id: string; code: string; nameAr: string; nameEn: string; description: string;
      isPublic: boolean; isActive: boolean; sortOrder: number; limits: unknown; features: unknown;
    }>`
      select id::text, code, name_ar as "nameAr", name_en as "nameEn", description,
        is_public as "isPublic", is_active as "isActive", sort_order as "sortOrder", limits, features
      from saas_plans order by sort_order, code
    `;
    const prices = await sql<{
      id: string; planId: string; planCode: string; countryCode: string; currency: string;
      monthlyPriceMinor: string; annualPriceMinor: string; active: boolean;
    }>`
      select pp.id::text, pp.plan_id::text as "planId", p.code as "planCode",
        pp.country_code as "countryCode", pp.currency,
        pp.monthly_price_minor::text as "monthlyPriceMinor",
        pp.annual_price_minor::text as "annualPriceMinor", pp.active
      from saas_plan_prices pp join saas_plans p on p.id = pp.plan_id
      order by p.sort_order, pp.country_code, pp.currency
    `;
    const recentAudit = await sql<{
      action: string; entity: string; entityId: string; actorUserId: string; createdAt: string; detail: unknown;
    }>`
      select action, entity, entity_id as "entityId", actor_user_id as "actorUserId",
        created_at::text as "createdAt", detail
      from saas_platform_audit order by created_at desc limit 30
    `;
    return { role, plans, prices, recentAudit };
  });

export const savePlatformPlan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    planId: string; description: string; isPublic: boolean; isActive: boolean;
    sortOrder: number; limits: Record<string, unknown>; features: Record<string, unknown>;
  }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requirePlatformAdmin(sql, context.userId, ["super_admin"]);
    const planId = uuid(data.planId);
    if (!planId || !Number.isSafeInteger(data.sortOrder) || data.sortOrder < 0) return { ok: false as const, error: "VALIDATION" };
    const limits = cleanPlanLimits(data.limits);
    const features = cleanPlanFeatures(data.features);
    await sql.transaction(async (tx) => {
      const updated = await tx<{ code: string }>`
        update saas_plans set description = ${text(data.description, 500)},
          is_public = ${data.isPublic}, is_active = ${data.isActive}, sort_order = ${data.sortOrder},
          limits = ${JSON.stringify(limits)}::jsonb, features = ${JSON.stringify(features)}::jsonb,
          updated_at = now()
        where id = ${planId}::uuid returning code
      `;
      if (!updated[0]) throw new Error("NOT_FOUND");
      await platformAudit(tx, context.userId, "update", "plan", planId, {
        code: updated[0].code, isPublic: data.isPublic, isActive: data.isActive, sortOrder: data.sortOrder,
        limits, features,
      });
    });
    return { ok: true as const };
  });

export const savePlatformMarketPrice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    planId: string; countryCode: string; currency: string;
    monthlyAmount: string; annualAmount: string; active: boolean;
  }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requirePlatformAdmin(sql, context.userId, ["super_admin"]);
    const planId = uuid(data.planId);
    const countryCode = text(data.countryCode, 2).toUpperCase();
    const currency = text(data.currency, 3).toUpperCase();
    if (!planId || !/^[A-Z]{2}$/.test(countryCode) || !/^[A-Z]{3}$/.test(currency)) {
      return { ok: false as const, error: "VALIDATION" };
    }
    const monthlyMinor = majorAmountToMinor(data.monthlyAmount, currency);
    const annualMinor = majorAmountToMinor(data.annualAmount, currency);
    await sql.transaction(async (tx) => {
      const rows = await tx<{ id: string }>`
        insert into saas_plan_prices (plan_id, country_code, currency, monthly_price_minor, annual_price_minor, active)
        values (${planId}::uuid, ${countryCode}, ${currency}, ${monthlyMinor}::bigint, ${annualMinor}::bigint, ${data.active})
        on conflict (plan_id, country_code, currency) do update set
          monthly_price_minor = excluded.monthly_price_minor,
          annual_price_minor = excluded.annual_price_minor,
          active = excluded.active, updated_at = now()
        returning id::text as id
      `;
      await platformAudit(tx, context.userId, "upsert", "plan_price", rows[0].id, {
        planId, countryCode, currency, monthlyMinor, annualMinor, active: data.active,
      });
    });
    return { ok: true as const };
  });

export const getSubscriptionOverview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "settings.write");
    const orgRows = await sql<{ countryCode: string; currency: string }>`
      select country_code as "countryCode", currency
      from organizations where id = ${data.orgId}::uuid
    `;
    const org = orgRows[0];
    if (!org) throw new Error("NOT_FOUND");

    const subscriptions = await sql<{
      status: string; billingCycle: string; trialEndsAt: string | null;
      currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean;
      planCode: string; planNameAr: string; planNameEn: string;
    }>`
      select s.status, s.billing_cycle as "billingCycle",
        s.trial_ends_at::text as "trialEndsAt",
        s.current_period_end::text as "currentPeriodEnd",
        s.cancel_at_period_end as "cancelAtPeriodEnd",
        p.code as "planCode", p.name_ar as "planNameAr", p.name_en as "planNameEn"
      from saas_subscriptions s join saas_plans p on p.id = s.plan_id
      where s.org_id = ${data.orgId}::uuid
      order by s.created_at desc limit 1
    `;
    const plans = await sql<{
      code: string; nameAr: string; nameEn: string; description: string;
      currency: string; monthlyPriceMinor: string | null; annualPriceMinor: string | null;
      limits: unknown; features: unknown;
    }>`
      select p.code, p.name_ar as "nameAr", p.name_en as "nameEn", p.description,
        ${org.currency}::text as currency,
        pp.monthly_price_minor::text as "monthlyPriceMinor",
        pp.annual_price_minor::text as "annualPriceMinor",
        p.limits, p.features
      from saas_plans p
      left join saas_plan_prices pp on pp.plan_id = p.id
        and pp.country_code = ${org.countryCode}
        and pp.currency = ${org.currency}
        and pp.active = true
      where p.is_public = true and p.is_active = true
      order by p.sort_order, p.name_ar
    `;
    const usageRows = await sql<{
      products: number; warehouses: number; branches: number; members: number;
    }>`
      select
        (select count(*)::int from products where org_id = ${data.orgId}::uuid and status = 'active') as products,
        (select count(*)::int from warehouses where org_id = ${data.orgId}::uuid and active) as warehouses,
        (select count(*)::int from branches where org_id = ${data.orgId}::uuid and active) as branches,
        (select count(*)::int from memberships where org_id = ${data.orgId}::uuid) as members
    `;
    return {
      countryCode: org.countryCode,
      currency: org.currency,
      subscription: subscriptions[0] ?? null,
      plans,
      usage: usageRows[0] ?? { products: 0, warehouses: 0, branches: 0, members: 0 },
      pricingConfigured: plans.some((plan) => plan.monthlyPriceMinor !== null && plan.annualPriceMinor !== null),
    };
  });

export const listSimple = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; kind: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "products.view");
    const org = data.orgId;
    if (data.kind === "categories") {
      return sql`select id::text, parent_id::text as "parentId", name_ar as "nameAr", name_en as "nameEn", description, active,
        (select count(*)::int from products p where p.category_id = categories.id) as "productCount"
        from categories where org_id = ${org}::uuid order by name_ar`;
    }
    if (data.kind === "units") {
      return sql`select id::text, code, name_ar as "nameAr", name_en as "nameEn", dimension from units where org_id = ${org}::uuid order by code`;
    }
    if (data.kind === "warehouses") {
      return sql`select w.id::text, w.code, w.name_ar as "nameAr", w.name_en as "nameEn", w.kind,
        w.address, w.city, w.phone, w.manager_name as "managerName", w.notes, w.active,
        w.branch_id::text as "branchId", b.name_ar as "branchNameAr", b.name_en as "branchNameEn"
        from warehouses w join branches b on b.id = w.branch_id and b.org_id = w.org_id
        where w.org_id = ${org}::uuid order by w.code`;
    }
    if (data.kind === "branches") {
      return sql`select b.id::text, b.code, b.name_ar as "nameAr", b.name_en as "nameEn",
        b.address, b.city, b.phone, b.active, b.is_default as "isDefault",
        (select count(*)::int from warehouses w where w.org_id = b.org_id and w.branch_id = b.id) as "warehouseCount"
        from branches b where b.org_id = ${org}::uuid order by b.is_default desc, b.code`;
    }
    if (data.kind === "suppliers") {
      return sql`select id::text, code, name_ar as "nameAr", name_en as "nameEn", company, contact, phone, email, address, country, city, tax_id as "taxId", payment_terms as "paymentTerms", currency, notes, active
        from suppliers where org_id = ${org}::uuid order by name_ar`;
    }
    if (data.kind === "customers") {
      return sql`select id::text, code, kind, name_ar as "nameAr", name_en as "nameEn", contact, phone, email, address, notes, active
        from customers where org_id = ${org}::uuid order by name_ar`;
    }
    if (data.kind === "fields") {
      return sql`select id::text, key, label_ar as "labelAr", label_en as "labelEn", field_type as "fieldType", required, options, sort
        from custom_fields where org_id = ${org}::uuid order by sort, label_ar`;
    }
    if (data.kind === "locations") {
      return sql`select id::text, warehouse_id::text as "warehouseId", parent_id::text as "parentId", code, name
        from locations where org_id = ${org}::uuid order by code`;
    }
    return [];
  });

export const saveSimple = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; kind: string; row: Record<string, unknown> }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const perm: Perm = data.kind === "suppliers" || data.kind === "customers" ? "partners.write" : data.kind === "fields" || data.kind === "units" || data.kind === "branches" ? "settings.write" : "products.write";
    if (data.kind === "warehouses" || data.kind === "locations") {
      await gate(sql, context.userId, data.orgId, "products.write");
    } else {
      await gate(sql, context.userId, data.orgId, perm);
    }
    const r = data.row;
    const id = uuid(r.id);
    const org = data.orgId;
    try {
      if (data.kind === "branches") {
        const code = text(r.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
        const nameAr = text(r.nameAr, 160);
        if (!code || !nameAr) return { ok: false as const, error: "VALIDATION" };
        const wantsDefault = Boolean(r.isDefault);
        const isActive = r.active !== false;
        if (!isActive && wantsDefault) throw new Error("SS:DEFAULT_BRANCH_REQUIRED");
        await sql.transaction(async (tx) => {
          // Serialize branch creation/default changes for this tenant.
          await tx`select id from organizations where id = ${org}::uuid for update`;
          if (!id && isActive) {
            const count = await tx<{ n: number }>`select count(*)::int as n from branches where org_id = ${org}::uuid and active`;
            await enforcePlanLimit(tx, org, "branches", count[0]?.n ?? 0);
          }
          if (id) {
            const existing = await tx<{ isDefault: boolean }>`
              select is_default as "isDefault" from branches
              where id = ${id}::uuid and org_id = ${org}::uuid
            `;
            if (!existing[0]) throw new Error("NOT_FOUND");
            if (existing[0].isDefault && !wantsDefault) throw new Error("SS:DEFAULT_BRANCH_REQUIRED");
            if (!isActive && wantsDefault) throw new Error("SS:DEFAULT_BRANCH_REQUIRED");
            if (!isActive) {
              const linked = await tx<{ n: number }>`select count(*)::int as n from warehouses where org_id = ${org}::uuid and branch_id = ${id}::uuid and active`;
              if ((linked[0]?.n ?? 0) > 0) throw new Error("SS:BRANCH_HAS_WAREHOUSES");
            }
            if (wantsDefault) await tx`update branches set is_default = false where org_id = ${org}::uuid`;
            await tx`update branches set code = ${code}, name_ar = ${nameAr}, name_en = ${text(r.nameEn, 160)},
              address = ${text(r.address, 300)}, city = ${text(r.city, 100)}, phone = ${text(r.phone, 40)},
              active = ${isActive}, is_default = ${wantsDefault}
              where id = ${id}::uuid and org_id = ${org}::uuid`;
            await audit(tx, org, context.userId, "update", "branch", id, { code, isDefault: wantsDefault, active: isActive });
          } else {
            if (wantsDefault) await tx`update branches set is_default = false where org_id = ${org}::uuid`;
            const rows = await tx<{ id: string }>`insert into branches
              (org_id, code, name_ar, name_en, address, city, phone, active, is_default)
              values (${org}::uuid, ${code}, ${nameAr}, ${text(r.nameEn, 160)}, ${text(r.address, 300)},
                ${text(r.city, 100)}, ${text(r.phone, 40)}, ${isActive}, ${wantsDefault})
              returning id::text as id`;
            await audit(tx, org, context.userId, "create", "branch", rows[0].id, { code, isDefault: wantsDefault });
          }
        });
      } else if (data.kind === "categories") {
        if (id) {
          await sql`update categories set name_ar=${text(r.nameAr)}, name_en=${text(r.nameEn)}, description=${text(r.description, 500)}, active=${r.active !== false}, parent_id=${uuid(r.parentId)}::uuid where id=${id}::uuid and org_id=${org}::uuid`;
        } else {
          await sql`insert into categories (org_id, name_ar, name_en, description, parent_id) values (${org}::uuid, ${text(r.nameAr)}, ${text(r.nameEn)}, ${text(r.description, 500)}, ${uuid(r.parentId)}::uuid)`;
        }
      } else if (data.kind === "units") {
        if (!text(r.code) || !text(r.nameAr)) return { ok: false as const, error: "VALIDATION" };
        if (id) {
          await sql`update units set name_ar=${text(r.nameAr)}, name_en=${text(r.nameEn)}, dimension=${text(r.dimension, 20) || "count"} where id=${id}::uuid and org_id=${org}::uuid`;
        } else {
          await sql`insert into units (org_id, code, name_ar, name_en, dimension) values (${org}::uuid, ${text(r.code, 20)}, ${text(r.nameAr)}, ${text(r.nameEn)}, ${text(r.dimension, 20) || "count"})`;
        }
      } else if (data.kind === "warehouses") {
        if (id) {
          await sql.transaction(async (tx) => {
            await tx`select id from organizations where id = ${org}::uuid for update`;
            const existing = await tx<{ active: boolean }>`select active from warehouses where id = ${id}::uuid and org_id = ${org}::uuid`;
            if (!existing[0]) throw new Error("NOT_FOUND");
            const nextActive = r.active !== false && r.active !== "false";
            if (!existing[0].active && nextActive) {
              const count = await tx<{ n: number }>`select count(*)::int as n from warehouses where org_id = ${org}::uuid and active`;
              await enforcePlanLimit(tx, org, "warehouses", count[0]?.n ?? 0);
            }
            await tx`update warehouses set branch_id=${uuid(r.branchId)}::uuid, name_ar=${text(r.nameAr)}, name_en=${text(r.nameEn)}, kind=${text(r.kind, 40) || "standard"}, address=${text(r.address, 300)}, city=${text(r.city)}, phone=${text(r.phone, 40)}, manager_name=${text(r.managerName)}, notes=${text(r.notes, 500)}, active=${nextActive} where id=${id}::uuid and org_id=${org}::uuid`;
          });
        } else {
          await sql.transaction(async (tx) => {
            await tx`select id from organizations where id = ${org}::uuid for update`;
            const count = await tx<{ n: number }>`select count(*)::int as n from warehouses where org_id = ${org}::uuid and active`;
            await enforcePlanLimit(tx, org, "warehouses", count[0]?.n ?? 0);
            await tx`insert into warehouses (org_id, branch_id, code, name_ar, name_en, kind, address, city, phone, manager_name, notes) values (${org}::uuid, ${uuid(r.branchId)}::uuid, ${text(r.code, 20)}, ${text(r.nameAr)}, ${text(r.nameEn)}, ${text(r.kind, 40) || "standard"}, ${text(r.address, 300)}, ${text(r.city)}, ${text(r.phone, 40)}, ${text(r.managerName)}, ${text(r.notes, 500)})`;
          });
        }
      } else if (data.kind === "locations") {
        const wh = uuid(r.warehouseId);
        if (!wh || !text(r.code) || !text(r.name)) return { ok: false as const, error: "VALIDATION" };
        if (id) await sql`update locations set code=${text(r.code, 30)}, name=${text(r.name)}, parent_id=${uuid(r.parentId)}::uuid where id=${id}::uuid and org_id=${org}::uuid`;
        else await sql`insert into locations (org_id, warehouse_id, parent_id, code, name) values (${org}::uuid, ${wh}::uuid, ${uuid(r.parentId)}::uuid, ${text(r.code, 30)}, ${text(r.name)})`;
      } else if (data.kind === "suppliers" || data.kind === "customers") {
        const table = data.kind;
        if (table === "suppliers") {
          if (id) {
            await sql`update suppliers set name_ar=${text(r.nameAr)}, name_en=${text(r.nameEn)}, company=${text(r.company)}, contact=${text(r.contact)}, phone=${text(r.phone, 40)}, email=${text(r.email)}, address=${text(r.address, 300)}, country=${text(r.country)}, city=${text(r.city)}, tax_id=${text(r.taxId, 40)}, payment_terms=${text(r.paymentTerms)}, currency=${text(r.currency, 8)}, notes=${text(r.notes, 500)}, active=${r.active !== false} where id=${id}::uuid and org_id=${org}::uuid`;
          } else {
            await sql`insert into suppliers (org_id, code, name_ar, name_en, company, contact, phone, email, address, country, city, tax_id, payment_terms, currency, notes) values (${org}::uuid, ${text(r.code, 20)}, ${text(r.nameAr)}, ${text(r.nameEn)}, ${text(r.company)}, ${text(r.contact)}, ${text(r.phone, 40)}, ${text(r.email)}, ${text(r.address, 300)}, ${text(r.country)}, ${text(r.city)}, ${text(r.taxId, 40)}, ${text(r.paymentTerms)}, ${text(r.currency, 8)}, ${text(r.notes, 500)})`;
          }
        } else if (id) {
          await sql`update customers set kind=${text(r.kind, 30) || "customer"}, name_ar=${text(r.nameAr)}, name_en=${text(r.nameEn)}, contact=${text(r.contact)}, phone=${text(r.phone, 40)}, email=${text(r.email)}, address=${text(r.address, 300)}, notes=${text(r.notes, 500)}, active=${r.active !== false} where id=${id}::uuid and org_id=${org}::uuid`;
        } else {
          await sql`insert into customers (org_id, code, kind, name_ar, name_en, contact, phone, email, address, notes) values (${org}::uuid, ${text(r.code, 20)}, ${text(r.kind, 30) || "customer"}, ${text(r.nameAr)}, ${text(r.nameEn)}, ${text(r.contact)}, ${text(r.phone, 40)}, ${text(r.email)}, ${text(r.address, 300)}, ${text(r.notes, 500)})`;
        }
      } else if (data.kind === "fields") {
        const key = text(r.key, 40).replace(/[^a-z0-9_]/gi, "").toLowerCase();
        if (!key || !text(r.labelAr)) return { ok: false as const, error: "VALIDATION" };
        const options = text(r.optionsText, 500).split(",").map((s) => s.trim()).filter(Boolean);
        if (id) {
          await sql`update custom_fields set label_ar=${text(r.labelAr)}, label_en=${text(r.labelEn)}, field_type=${text(r.fieldType, 20)}, required=${Boolean(r.required)}, options=${JSON.stringify(options)}::jsonb where id=${id}::uuid and org_id=${org}::uuid`;
        } else {
          await sql`insert into custom_fields (org_id, entity, key, label_ar, label_en, field_type, required, options) values (${org}::uuid, 'product', ${key}, ${text(r.labelAr)}, ${text(r.labelEn)}, ${text(r.fieldType, 20) || "text"}, ${Boolean(r.required)}, ${JSON.stringify(options)}::jsonb)`;
        }
      }
    } catch (e) {
      const b = biz(e);
      if (b) return b;
      throw e;
    }
    if (data.kind !== "branches") await audit(sql, org, context.userId, "save", data.kind, id ?? "new", {});
    return { ok: true as const };
  });

export const listProducts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; q?: string; status?: string; categoryId?: string; page?: number }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const g = await gate(sql, context.userId, data.orgId, "products.view");
    const seeCost = can(g.role, jarr(g.grants), jarr(g.revokes), "cost.view");
    const page = Math.max(0, data.page ?? 0);
    const q = text(data.q, 80);
    const status = text(data.status, 20);
    const cat = uuid(data.categoryId);
    const rows = await sql.query<Record<string, unknown>>(
      `select p.id::text, p.sku, p.barcode, p.name_ar as "nameAr", p.name_en as "nameEn", p.product_type as "productType",
              p.status, p.price::text, case when $6 then p.avg_cost::text else null end as "avgCost",
              p.reorder_point::text as "reorderPoint", p.min_qty::text as "minQty", p.max_qty::text as "maxQty",
              p.track_batch as "trackBatch", p.track_expiry as "trackExpiry", p.track_serial as "trackSerial",
              p.category_id::text as "categoryId", p.base_unit_id::text as "baseUnitId", p.brand, p.manufacturer,
              p.supplier_id::text as "supplierId", p.parent_id::text as "parentId", p.image, p.notes, p.custom, p.description,
              coalesce(sum(b.on_hand),0)::text as "onHand", coalesce(sum(b.reserved),0)::text as reserved
       from products p
       left join stock_balance b on b.product_id = p.id
       where p.org_id = $1::uuid
         and ($2 = '' or p.name_ar ilike '%'||$2||'%' or p.name_en ilike '%'||$2||'%' or p.sku ilike '%'||$2||'%' or p.barcode = $2)
         and ($3 = '' or p.status = $3)
         and ($4::uuid is null or p.category_id = $4::uuid)
       group by p.id
       order by p.name_ar
       limit 50 offset $5`,
      [data.orgId, q, status, cat, page * 50, seeCost],
    );
    const total = await sql.query<{ n: number }>(
      `select count(*)::int as n from products p where p.org_id = $1::uuid
         and ($2 = '' or p.name_ar ilike '%'||$2||'%' or p.name_en ilike '%'||$2||'%' or p.sku ilike '%'||$2||'%' or p.barcode = $2)
         and ($3 = '' or p.status = $3)
         and ($4::uuid is null or p.category_id = $4::uuid)`,
      [data.orgId, q, status, cat],
    );
    return { rows, total: total[0]?.n ?? 0 };
  });

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: ProductInput) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "products.write");
    if (!text(data.sku, 60) || !text(data.nameAr)) return { ok: false as const, error: "VALIDATION" };
    if ((data.image?.length ?? 0) > 400_000) return { ok: false as const, error: "VALIDATION" };
    const id = uuid(data.id);
    try {
      let productId = id;
      if (id) {
        await sql.query(
          `update products set sku=$3, barcode=$4, name_ar=$5, name_en=$6, description=$7, image=$8, category_id=$9::uuid,
             brand=$10, manufacturer=$11, product_type=$12, base_unit_id=$13::uuid, price=$14, reorder_point=$15, min_qty=$16,
             max_qty=$17, supplier_id=$18::uuid, track_batch=$19, track_expiry=$20, track_serial=$21, parent_id=$22::uuid,
             notes=$23, custom=$24::jsonb, updated_at=now()
           where id=$2::uuid and org_id=$1::uuid`,
          [data.orgId, id, text(data.sku, 60), text(data.barcode, 80), text(data.nameAr), text(data.nameEn), text(data.description, 1000),
            text(data.image, 400_000), uuid(data.categoryId), text(data.brand), text(data.manufacturer), text(data.productType, 30) || "standard",
            uuid(data.baseUnitId), num(data.price) ?? 0, num(data.reorderPoint) ?? 0, num(data.minQty) ?? 0, num(data.maxQty),
            uuid(data.supplierId), Boolean(data.trackBatch), Boolean(data.trackExpiry), Boolean(data.trackSerial), uuid(data.parentId),
            text(data.notes, 800), JSON.stringify(data.custom ?? {})],
        );
      } else {
        const ins = await sql.transaction(async (tx) => {
          await tx`select id from organizations where id = ${data.orgId}::uuid for update`;
          const count = await tx<{ n: number }>`select count(*)::int as n from products where org_id = ${data.orgId}::uuid and status = 'active'`;
          await enforcePlanLimit(tx, data.orgId, "products", count[0]?.n ?? 0);
          return tx.query<{ id: string }>(
            `insert into products (org_id, sku, barcode, name_ar, name_en, description, image, category_id, brand, manufacturer, product_type, base_unit_id, price, reorder_point, min_qty, max_qty, supplier_id, track_batch, track_expiry, track_serial, parent_id, notes, custom)
             values ($1::uuid,$2,$3,$4,$5,$6,$7,$8::uuid,$9,$10,$11,$12::uuid,$13,$14,$15,$16,$17::uuid,$18,$19,$20,$21::uuid,$22,$23::jsonb)
             returning id::text as id`,
            [data.orgId, text(data.sku, 60), text(data.barcode, 80), text(data.nameAr), text(data.nameEn), text(data.description, 1000),
              text(data.image, 400_000), uuid(data.categoryId), text(data.brand), text(data.manufacturer), text(data.productType, 30) || "standard",
              uuid(data.baseUnitId), num(data.price) ?? 0, num(data.reorderPoint) ?? 0, num(data.minQty) ?? 0, num(data.maxQty),
              uuid(data.supplierId), Boolean(data.trackBatch), Boolean(data.trackExpiry), Boolean(data.trackSerial), uuid(data.parentId),
              text(data.notes, 800), JSON.stringify(data.custom ?? {})],
          );
        });
        productId = ins[0].id;
      }
      if (productId && data.units) {
        await sql`delete from product_units where product_id = ${productId}::uuid`;
        for (const u of data.units) {
          const factor = num(u.factor);
          if (uuid(u.unitId) && factor && factor > 0) {
            await sql`insert into product_units (org_id, product_id, unit_id, factor) values (${data.orgId}::uuid, ${productId}::uuid, ${u.unitId}::uuid, ${factor})`;
          }
        }
      }
      await audit(sql, data.orgId, context.userId, id ? "update" : "create", "product", productId ?? "", { sku: data.sku });
      return { ok: true as const, id: productId };
    } catch (e) {
      const b = biz(e);
      if (b) return b;
      throw e;
    }
  });

export const setProductStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; id: string; status: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "products.archive");
    const status = data.status === "active" ? "active" : "archived";
    await sql.transaction(async (tx) => {
      if (status === "active") {
        await tx`select id from organizations where id = ${data.orgId}::uuid for update`;
        const count = await tx<{ n: number }>`select count(*)::int as n from products
          where org_id = ${data.orgId}::uuid and status = 'active' and id <> ${data.id}::uuid`;
        await enforcePlanLimit(tx, data.orgId, "products", count[0]?.n ?? 0);
      }
      await tx`update products set status=${status}, updated_at=now()
        where id=${data.id}::uuid and org_id=${data.orgId}::uuid`;
      await audit(tx, data.orgId, context.userId, status, "product", data.id, {});
    });
    return { ok: true as const };
  });

export const importProducts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; rows: { sku: string; nameAr: string; nameEn?: string; barcode?: string; cost?: number; price?: number; reorder?: number }[] }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "products.write");
    const rows = (data.rows ?? []).slice(0, 400);
    try {
      return await sql.transaction(async (tx) => {
        // Serialize catalog additions per tenant so simultaneous imports and
        // manual product creation cannot exceed a configured plan limit.
        await tx`select id from organizations where id = ${data.orgId}::uuid for update`;
        const unit = await tx<{ id: string }>`select id::text as id from units where org_id=${data.orgId}::uuid and code='pcs'`;
        const countRows = await tx<{ n: number }>`select count(*)::int as n from products where org_id=${data.orgId}::uuid and status = 'active'`;
        let activeCount = countRows[0]?.n ?? 0;
        let created = 0;
        let updated = 0;
        const errors: string[] = [];
        for (const row of rows) {
          const sku = text(row.sku, 60);
          const nameAr = text(row.nameAr);
          if (!sku || !nameAr) {
            errors.push(sku || "?");
            continue;
          }
          const existing = await tx<{ id: string }>`select id::text as id from products where org_id=${data.orgId}::uuid and sku=${sku}`;
          if (existing[0]) {
            await tx`update products set name_ar=${nameAr}, name_en=${text(row.nameEn)}, barcode=${text(row.barcode, 80)}, price=${num(row.price) ?? 0}, reorder_point=${num(row.reorder) ?? 0}, updated_at=now() where id=${existing[0].id}::uuid and org_id=${data.orgId}::uuid`;
            updated += 1;
          } else {
            await enforcePlanLimit(tx, data.orgId, "products", activeCount);
            await tx`insert into products (org_id, sku, barcode, name_ar, name_en, base_unit_id, price, reorder_point, avg_cost)
              values (${data.orgId}::uuid, ${sku}, ${text(row.barcode, 80)}, ${nameAr}, ${text(row.nameEn)}, ${unit[0]?.id ?? null}::uuid, ${num(row.price) ?? 0}, ${num(row.reorder) ?? 0}, ${num(row.cost) ?? 0})`;
            created += 1;
            activeCount += 1;
          }
        }
        await audit(tx, data.orgId, context.userId, "import", "product", data.orgId, { created, updated });
        return { ok: true as const, created, updated, errors };
      });
    } catch (error) {
      const b = biz(error);
      if (b) return b;
      throw error;
    }
  });

export const productUnits = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; productId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "products.view");
    return sql<{ unitId: string; factor: string }>`
      select unit_id::text as "unitId", factor::text from product_units pu
      join products p on p.id = pu.product_id
      where pu.product_id = ${data.productId}::uuid and p.org_id = ${data.orgId}::uuid
    `;
  });

export const listBalances = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; q?: string; warehouseId?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const g = await gate(sql, context.userId, data.orgId, "stock.view");
    const seeCost = can(g.role, jarr(g.grants), jarr(g.revokes), "cost.view");
    return sql.query(
      `select p.id::text as "productId", p.sku, p.name_ar as "nameAr", p.name_en as "nameEn", w.id::text as "warehouseId",
              w.name_ar as "warehouse", b.on_hand::text as "onHand", b.reserved::text as reserved,
              (b.on_hand - b.reserved)::text as available,
              case when $4 then p.avg_cost::text else null end as "avgCost"
       from stock_balance b
       join products p on p.id = b.product_id
       join warehouses w on w.id = b.warehouse_id
       where b.org_id = $1::uuid
         and ($2 = '' or p.name_ar ilike '%'||$2||'%' or p.sku ilike '%'||$2||'%' or p.barcode = $2)
         and ($3::uuid is null or b.warehouse_id = $3::uuid)
         and (b.on_hand <> 0 or b.reserved <> 0)
       order by p.name_ar, w.code
       limit 300`,
      [data.orgId, text(data.q, 80), uuid(data.warehouseId), seeCost],
    );
  });

export const listDocuments = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; docType?: string; status?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "stock.view");
    return sql.query(
      `select d.id::text, d.doc_no as "docNo", d.doc_type as "docType", d.status, d.reference, d.reason, d.notes,
              d.warehouse_id::text as "warehouseId", d.warehouse_to_id::text as "warehouseToId",
              d.created_at::text as "createdAt", d.posted_at::text as "postedAt",
              w.name_ar as warehouse, w2.name_ar as "warehouseTo"
       from documents d
       left join warehouses w on w.id = d.warehouse_id
       left join warehouses w2 on w2.id = d.warehouse_to_id
       where d.org_id = $1::uuid
         and ($2 = '' or d.doc_type = $2)
         and ($3 = '' or d.status = $3)
       order by d.created_at desc
       limit 200`,
      [data.orgId, text(data.docType, 40), text(data.status, 20)],
    );
  });

export const getDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; id: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const g = await gate(sql, context.userId, data.orgId, "stock.view");
    const seeCost = can(g.role, jarr(g.grants), jarr(g.revokes), "cost.view");
    const header = await sql.query(
      `select id::text, doc_no as "docNo", doc_type as "docType", status, reference, reason, notes,
              warehouse_id::text as "warehouseId", warehouse_to_id::text as "warehouseToId",
              created_at::text as "createdAt", posted_at::text as "postedAt"
       from documents where id = $2::uuid and org_id = $1::uuid`,
      [data.orgId, data.id],
    );
    const lines = await sql.query(
      `select l.id::text, l.product_id::text as "productId", p.name_ar as "nameAr", p.sku, l.direction, l.qty::text, l.qty_base::text as "qtyBase",
              l.unit_id::text as "unitId", case when $3 then l.unit_cost::text else null end as "unitCost",
              l.batch_no as "batchNo", l.expiry_date::text as expiry, l.serial_no as "serialNo"
       from document_lines l join products p on p.id = l.product_id
       where l.document_id = $2::uuid and l.org_id = $1::uuid order by l.line_no`,
      [data.orgId, data.id, seeCost],
    );
    return { header: header[0] ?? null, lines };
  });

export const saveDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: DocInput) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "stock.post");
    try {
      const rows = await sql<{ id: string }>`select ss_save_document(${data.orgId}::uuid, ${context.userId}, ${JSON.stringify({
        id: data.id ?? "",
        idempotencyKey: data.idempotencyKey ?? "",
        docType: data.docType,
        warehouseId: data.warehouseId ?? "",
        warehouseToId: data.warehouseToId ?? "",
        partnerType: data.partnerType ?? "",
        partnerId: data.partnerId ?? "",
        reference: data.reference ?? "",
        reason: data.reason ?? "",
        notes: data.notes ?? "",
        lines: (data.lines ?? []).map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitId: l.unitId ?? "",
          unitCost: l.unitCost ?? "",
          direction: l.direction ?? "",
          batchNo: l.batchNo ?? "",
          expiry: l.expiry ?? "",
          serialNo: l.serialNo ?? "",
          locationId: l.locationId ?? "",
        })),
      })}::jsonb)::text as id`;
      return { ok: true as const, id: rows[0].id };
    } catch (e) {
      const b = biz(e);
      if (b) return b;
      throw e;
    }
  });

export const postDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; id: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "stock.post");
    await ensureFinanceAccounts(sql, data.orgId);
    try {
      await sql`select ss_post_document(${data.orgId}::uuid, ${data.id}::uuid, ${context.userId})`;
      return { ok: true as const };
    } catch (e) {
      const b = biz(e);
      if (b) return b;
      throw e;
    }
  });

export const reverseDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; id: string; reason: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "stock.reverse");
    try {
      const rows = await sql<{ id: string }>`select ss_reverse_document(${data.orgId}::uuid, ${data.id}::uuid, ${context.userId}, ${text(data.reason, 300)})::text as id`;
      return { ok: true as const, id: rows[0].id };
    } catch (e) {
      const b = biz(e);
      if (b) return b;
      throw e;
    }
  });

export const listOrders = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; kind: "purchase" | "sales" }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, data.kind === "purchase" ? "purchasing.view" : "sales.view");
    if (data.kind === "purchase") {
      return sql`
        select po.id::text, po.doc_no as "docNo", po.status, po.order_date::text as "orderDate", po.expected_date::text as "expectedDate",
               po.notes, po.shipping::text, s.name_ar as supplier, w.name_ar as warehouse,
               po.supplier_id::text as "supplierId", po.warehouse_id::text as "warehouseId"
        from purchase_orders po
        join suppliers s on s.id = po.supplier_id
        join warehouses w on w.id = po.warehouse_id
        where po.org_id = ${data.orgId}::uuid
        order by po.created_at desc limit 200`;
    }
    return sql`
      select so.id::text, so.doc_no as "docNo", so.status, so.notes, so.created_at::text as "createdAt",
             c.name_ar as customer, w.name_ar as warehouse, so.customer_id::text as "customerId", so.warehouse_id::text as "warehouseId"
      from sales_orders so
      left join customers c on c.id = so.customer_id
      join warehouses w on w.id = so.warehouse_id
      where so.org_id = ${data.orgId}::uuid
      order by so.created_at desc limit 200`;
  });

export const getOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; id: string; kind: "purchase" | "sales" }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const g = await gate(sql, context.userId, data.orgId, data.kind === "purchase" ? "purchasing.view" : "sales.view");
    const seeCost = can(g.role, jarr(g.grants), jarr(g.revokes), "cost.view");
    if (data.kind === "purchase") {
      const lines = await sql.query(
        `select l.id::text, l.product_id::text as "productId", p.name_ar as "nameAr", p.sku, l.qty::text, l.qty_received::text as "qtyReceived",
                l.unit_id::text as "unitId", case when $3 then l.unit_price::text else null end as "unitPrice", l.tax_rate::text as "taxRate"
         from purchase_lines l join products p on p.id = l.product_id
         where l.order_id = $2::uuid and l.org_id = $1::uuid order by l.line_no`,
        [data.orgId, data.id, seeCost],
      );
      return { lines };
    }
    const lines = await sql.query(
      `select l.id::text, l.product_id::text as "productId", p.name_ar as "nameAr", p.sku, l.qty::text, l.qty_dispatched::text as "qtyDispatched",
              l.unit_id::text as "unitId", l.unit_price::text as "unitPrice"
       from sales_lines l join products p on p.id = l.product_id
       where l.order_id = $2::uuid and l.org_id = $1::uuid order by l.line_no`,
      [data.orgId, data.id],
    );
    return { lines };
  });

export const savePurchase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; id?: string; supplierId: string; warehouseId: string; expectedDate?: string; notes?: string; shipping?: number; lines: LineShape[] }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "purchasing.write");
    try {
      const rows = await sql<{ id: string }>`select ss_save_purchase(${data.orgId}::uuid, ${context.userId}, ${JSON.stringify({
        id: data.id ?? "",
        supplierId: data.supplierId,
        warehouseId: data.warehouseId,
        expectedDate: data.expectedDate ?? "",
        notes: data.notes ?? "",
        shipping: data.shipping ?? 0,
        lines: data.lines,
      })}::jsonb)::text as id`;
      return { ok: true as const, id: rows[0].id };
    } catch (e) {
      const b = biz(e);
      if (b) return b;
      throw e;
    }
  });

type LineShape = { productId: string; qty: number; unitId?: string; unitPrice?: number; taxRate?: number; lineId?: string };

export const setPurchaseStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; id: string; status: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, data.status === "approved" ? "purchasing.approve" : "purchasing.write");
    try {
      await sql`select ss_set_po_status(${data.orgId}::uuid, ${data.id}::uuid, ${context.userId}, ${data.status})`;
      return { ok: true as const };
    } catch (e) {
      const b = biz(e);
      if (b) return b;
      throw e;
    }
  });

export const receivePurchase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; id: string; idempotencyKey: string; lines: { lineId: string; qty: number; batchNo?: string; expiry?: string }[] }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "stock.post");
    await ensureFinanceAccounts(sql, data.orgId);
    try {
      const rows = await sql<{ id: string }>`select ss_receive_po(${data.orgId}::uuid, ${data.id}::uuid, ${context.userId}, ${JSON.stringify(data.lines)}::jsonb, ${data.idempotencyKey})::text as id`;
      return { ok: true as const, id: rows[0].id };
    } catch (e) {
      const b = biz(e);
      if (b) return b;
      throw e;
    }
  });

export const saveSales = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; id?: string; customerId?: string; warehouseId: string; notes?: string; lines: LineShape[] }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "sales.write");
    try {
      const rows = await sql<{ id: string }>`select ss_save_sales(${data.orgId}::uuid, ${context.userId}, ${JSON.stringify({
        id: data.id ?? "",
        customerId: data.customerId ?? "",
        warehouseId: data.warehouseId,
        notes: data.notes ?? "",
        lines: data.lines,
      })}::jsonb)::text as id`;
      return { ok: true as const, id: rows[0].id };
    } catch (e) {
      const b = biz(e);
      if (b) return b;
      throw e;
    }
  });

export const salesAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; id: string; action: string; idempotencyKey?: string; lines?: { lineId: string; qty: number }[] }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "sales.write");
    await ensureFinanceAccounts(sql, data.orgId);
    try {
      if (data.action === "confirm") {
        await sql`select ss_confirm_sales(${data.orgId}::uuid, ${data.id}::uuid, ${context.userId})`;
      } else if (data.action === "cancel") {
        await sql`select ss_cancel_sales(${data.orgId}::uuid, ${data.id}::uuid, ${context.userId})`;
      } else if (data.action === "dispatch") {
        await gate(sql, context.userId, data.orgId, "stock.post");
        await sql`select ss_dispatch_sales(${data.orgId}::uuid, ${data.id}::uuid, ${context.userId}, ${JSON.stringify(data.lines ?? [])}::jsonb, ${data.idempotencyKey ?? ""})`;
      } else return { ok: false as const, error: "VALIDATION" };
      return { ok: true as const };
    } catch (e) {
      const b = biz(e);
      if (b) return b;
      throw e;
    }
  });

export const listStocktakes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "stock.view");
    return sql`select s.id::text, s.doc_no as "docNo", s.status, s.notes, s.created_at::text as "createdAt", w.name_ar as warehouse, s.warehouse_id::text as "warehouseId"
      from stocktakes s join warehouses w on w.id = s.warehouse_id where s.org_id = ${data.orgId}::uuid order by s.created_at desc limit 100`;
  });

export const stocktakeLines = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; id: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "stock.view");
    return sql`select l.id::text, l.product_id::text as "productId", p.sku, p.name_ar as "nameAr", l.system_qty::text as "systemQty", l.counted_qty::text as "countedQty", l.reason
      from stocktake_lines l join products p on p.id = l.product_id
      where l.stocktake_id = ${data.id}::uuid and l.org_id = ${data.orgId}::uuid order by p.name_ar`;
  });

export const createStocktake = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; warehouseId: string; notes?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "stocktake.post");
    try {
      const rows = await sql<{ id: string }>`select ss_create_stocktake(${data.orgId}::uuid, ${data.warehouseId}::uuid, ${context.userId}, ${text(data.notes, 300)})::text as id`;
      return { ok: true as const, id: rows[0].id };
    } catch (e) {
      const b = biz(e);
      if (b) return b;
      throw e;
    }
  });

export const saveStocktakeCounts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; id: string; lines: { id: string; countedQty: number | null; reason?: string }[] }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "stock.post");
    const st = await sql<{ status: string }>`select status from stocktakes where id=${data.id}::uuid and org_id=${data.orgId}::uuid`;
    if (st[0]?.status !== "draft") return { ok: false as const, error: "NOT_DRAFT" };
    for (const line of data.lines) {
      await sql`update stocktake_lines set counted_qty = ${line.countedQty}, reason = ${text(line.reason, 200)}
        where id = ${line.id}::uuid and stocktake_id = ${data.id}::uuid and org_id = ${data.orgId}::uuid`;
    }
    return { ok: true as const };
  });

export const postStocktake = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; id: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "stocktake.post");
    await ensureFinanceAccounts(sql, data.orgId);
    try {
      await sql`select ss_post_stocktake(${data.orgId}::uuid, ${data.id}::uuid, ${context.userId})`;
      return { ok: true as const };
    } catch (e) {
      const b = biz(e);
      if (b) return b;
      throw e;
    }
  });

export const listBoms = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "products.view");
    const boms = await sql`select b.id::text, b.name, b.kind, b.yield_qty::text as "yieldQty", b.notes, b.product_id::text as "productId", p.name_ar as product
      from boms b join products p on p.id = b.product_id where b.org_id = ${data.orgId}::uuid and b.active order by b.created_at desc`;
    const lines = await sql`select bom_id::text as "bomId", id::text, product_id::text as "productId", qty::text from bom_lines where org_id = ${data.orgId}::uuid`;
    return { boms, lines };
  });

export const saveBom = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; id?: string; productId: string; name: string; kind: string; yieldQty: number; lines: { productId: string; qty: number }[] }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "products.write");
    const id = uuid(data.id);
    let bomId = id;
    if (id) {
      await sql`update boms set name=${text(data.name)}, kind=${text(data.kind, 30) || "manufacturing"}, yield_qty=${num(data.yieldQty) ?? 1}, product_id=${data.productId}::uuid where id=${id}::uuid and org_id=${data.orgId}::uuid`;
      await sql`delete from bom_lines where bom_id=${id}::uuid`;
    } else {
      const rows = await sql<{ id: string }>`insert into boms (org_id, product_id, kind, name, yield_qty) values (${data.orgId}::uuid, ${data.productId}::uuid, ${text(data.kind, 30) || "manufacturing"}, ${text(data.name)}, ${num(data.yieldQty) ?? 1}) returning id::text as id`;
      bomId = rows[0].id;
    }
    let i = 0;
    for (const line of data.lines) {
      i += 1;
      if (num(line.qty) && uuid(line.productId)) {
        await sql`insert into bom_lines (bom_id, org_id, product_id, qty, line_no) values (${bomId}::uuid, ${data.orgId}::uuid, ${line.productId}::uuid, ${line.qty}, ${i})`;
      }
    }
    await audit(sql, data.orgId, context.userId, "save", "bom", bomId ?? "", {});
    return { ok: true as const, id: bomId };
  });

export const runProduction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; bomId: string; warehouseId: string; runs: number }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "stock.post");
    await ensureFinanceAccounts(sql, data.orgId);
    const runs = num(data.runs);
    if (!runs || runs <= 0) return { ok: false as const, error: "VALIDATION" };
    const bom = await sql<{ product_id: string; yield_qty: string; name: string }>`select product_id::text, yield_qty::text, name from boms where id=${data.bomId}::uuid and org_id=${data.orgId}::uuid`;
    if (!bom[0]) return { ok: false as const, error: "NOT_FOUND" };
    const comps = await sql<{ product_id: string; qty: string; avg_cost: string }>`
      select bl.product_id::text, bl.qty::text, p.avg_cost::text from bom_lines bl join products p on p.id = bl.product_id where bl.bom_id=${data.bomId}::uuid`;
    const yieldQty = Number(bom[0].yield_qty) * runs;
    let cost = 0;
    const lines: Record<string, unknown>[] = [];
    for (const c of comps) {
      const q = Number(c.qty) * runs;
      cost += q * Number(c.avg_cost);
      lines.push({ productId: c.product_id, qty: q, direction: "out" });
    }
    const unitCost = yieldQty > 0 ? cost / yieldQty : 0;
    lines.push({ productId: bom[0].product_id, qty: yieldQty, direction: "in", unitCost });
    try {
      const saved = await sql<{ id: string }>`select ss_save_document(${data.orgId}::uuid, ${context.userId}, ${JSON.stringify({
        docType: "production", warehouseId: data.warehouseId, notes: bom[0].name, lines,
      })}::jsonb)::text as id`;
      await sql`select ss_post_document(${data.orgId}::uuid, ${saved[0].id}::uuid, ${context.userId})`;
      return { ok: true as const, id: saved[0].id };
    } catch (e) {
      const b = biz(e);
      if (b) return b;
      throw e;
    }
  });

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; days: number }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const g = await gate(sql, context.userId, data.orgId, "stock.view");
    const seeCost = can(g.role, jarr(g.grants), jarr(g.revokes), "cost.view");
    const days = Math.min(180, Math.max(7, data.days || 30));
    const org = data.orgId;
    const k = await sql.query<{
      skus: number; warehouses: number; value: string; low: number; outc: number; expiring: number; openpo: number; inbound: string; outbound: string;
    }>(
      `select
        (select count(*)::int from products where org_id=$1 and status='active' and product_type<>'service') as skus,
        (select count(*)::int from warehouses where org_id=$1 and active) as warehouses,
        (select coalesce(sum(b.on_hand * p.avg_cost),0)::text from stock_balance b join products p on p.id=b.product_id where b.org_id=$1) as value,
        (select count(*)::int from (
            select p.id from products p left join stock_balance b on b.product_id=p.id
            where p.org_id=$1 and p.status='active' and p.product_type<>'service' and p.reorder_point>0
            group by p.id, p.reorder_point having coalesce(sum(b.on_hand),0) <= p.reorder_point and coalesce(sum(b.on_hand),0) > 0
        ) t) as low,
        (select count(*)::int from products p where p.org_id=$1 and p.status='active' and p.product_type<>'service'
            and not exists (select 1 from stock_balance b where b.product_id=p.id and b.on_hand>0)
            and exists (select 1 from ledger l where l.product_id=p.id)) as outc,
        (select count(*)::int from stock_batch sb where sb.org_id=$1 and sb.qty>0 and sb.expiry_date is not null
            and sb.expiry_date <= current_date + (select expiry_warn_days from organizations where id=$1)) as expiring,
        (select count(*)::int from purchase_orders where org_id=$1 and status in ('approved','partial')) as openpo,
        (select coalesce(sum(qty_base),0)::text from ledger where org_id=$1 and direction='in' and posted_at >= now() - make_interval(days => $2)) as inbound,
        (select coalesce(sum(qty_base),0)::text from ledger where org_id=$1 and direction='out' and posted_at >= now() - make_interval(days => $2)) as outbound
      `,
      [org, days],
    );
    const slow = await sql.query<{ n: number }>(
      `select count(*)::int as n from (
         select p.id from products p join stock_balance b on b.product_id=p.id
         where p.org_id=$1 and p.status='active' group by p.id having sum(b.on_hand)>0
         and not exists (select 1 from ledger l where l.product_id=p.id and l.direction='out' and l.posted_at >= now() - make_interval(days => (select slow_days from organizations where id=$1)))
       ) t`,
      [org],
    );
    const series = await sql.query<{ day: string; inbound: string; outbound: string }>(
      `select to_char(posted_at::date, 'YYYY-MM-DD') as day,
              coalesce(sum(qty_base) filter (where direction='in'),0)::text as inbound,
              coalesce(sum(qty_base) filter (where direction='out'),0)::text as outbound
       from ledger where org_id=$1 and posted_at >= now() - make_interval(days => $2) and direction in ('in','out')
       group by posted_at::date order by posted_at::date`,
      [org, days],
    );
    const top = await sql.query<{ name: string; qty: string }>(
      `select p.name_ar as name, sum(l.qty_base)::text as qty from ledger l join products p on p.id=l.product_id
       where l.org_id=$1 and l.direction='out' and l.posted_at >= now() - make_interval(days => $2)
       group by p.id, p.name_ar order by sum(l.qty_base) desc limit 6`,
      [org, days],
    );
    const byWh = await sql.query<{ name: string; value: string }>(
      `select w.name_ar as name, coalesce(sum(b.on_hand * p.avg_cost),0)::text as value
       from stock_balance b join warehouses w on w.id=b.warehouse_id join products p on p.id=b.product_id
       where b.org_id=$1 group by w.id, w.name_ar order by sum(b.on_hand * p.avg_cost) desc`,
      [org],
    );
    const recent = await sql.query(
      `select doc_no as "docNo", doc_type as "docType", status, posted_at::text as "postedAt", created_at::text as "createdAt"
       from documents where org_id=$1 order by created_at desc limit 8`,
      [org],
    );
    const row = k[0];
    return {
      kpis: {
        skus: row?.skus ?? 0,
        warehouses: row?.warehouses ?? 0,
        value: seeCost ? row?.value ?? "0" : null,
        low: row?.low ?? 0,
        out: row?.outc ?? 0,
        slow: slow[0]?.n ?? 0,
        expiring: row?.expiring ?? 0,
        openPo: row?.openpo ?? 0,
        inbound: row?.inbound ?? "0",
        outbound: row?.outbound ?? "0",
      },
      series,
      top,
      byWh: seeCost ? byWh : byWh.map((w) => ({ name: w.name, value: "" })),
      recent,
      seeCost,
    };
  });

export const listAlerts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "stock.view");
    const org = data.orgId;
    const states = await sql<{ alert_key: string; status: string; note: string }>`select alert_key, status, note from alert_states where org_id=${org}::uuid`;
    const stateMap = new Map(states.map((s) => [s.alert_key, s]));
    type Alert = { key: string; kind: string; title: string; detail: string; severity: string; status: string };
    const alerts: Alert[] = [];
    const lows = await sql<{ id: string; name: string; on_hand: string; reorder_point: string }>`
      select p.id::text, p.name_ar as name, coalesce(sum(b.on_hand),0)::text as on_hand, p.reorder_point::text
      from products p left join stock_balance b on b.product_id=p.id
      where p.org_id=${org}::uuid and p.status='active' and p.product_type<>'service' and p.reorder_point>0
      group by p.id having coalesce(sum(b.on_hand),0) <= p.reorder_point`;
    for (const row of lows) {
      const out = Number(row.on_hand) <= 0;
      alerts.push({
        key: `${out ? "out" : "low"}:${row.id}`,
        kind: out ? "out" : "low",
        title: row.name,
        detail: row.on_hand,
        severity: out ? "high" : "medium",
        status: "open",
      });
    }
    const exp = await sql<{ batch_no: string; name: string; expiry: string; qty: string; product_id: string }>`
      select sb.batch_no, p.name_ar as name, sb.expiry_date::text as expiry, sb.qty::text, sb.product_id::text
      from stock_batch sb join products p on p.id=sb.product_id
      where sb.org_id=${org}::uuid and sb.qty>0 and sb.expiry_date is not null
        and sb.expiry_date <= current_date + (select expiry_warn_days from organizations where id=${org}::uuid)
      order by sb.expiry_date limit 30`;
    for (const row of exp) {
      const expired = row.expiry < new Date().toISOString().slice(0, 10);
      alerts.push({
        key: `exp:${row.product_id}:${row.batch_no}`,
        kind: expired ? "expired" : "expiring",
        title: row.name,
        detail: `${row.batch_no} · ${row.expiry}`,
        severity: expired ? "high" : "medium",
        status: "open",
      });
    }
    const late = await sql<{ id: string; doc_no: string; expected: string }>`
      select id::text, doc_no, expected_date::text as expected from purchase_orders
      where org_id=${org}::uuid and status in ('approved','partial') and expected_date is not null and expected_date < current_date`;
    for (const row of late) {
      alerts.push({ key: `po:${row.id}`, kind: "po", title: row.doc_no, detail: row.expected, severity: "medium", status: "open" });
    }
    const drafts = await sql<{ n: number }>`select count(*)::int as n from documents where org_id=${org}::uuid and status='draft'`;
    if ((drafts[0]?.n ?? 0) > 0) {
      alerts.push({ key: "pending:drafts", kind: "pending", title: String(drafts[0].n), detail: "", severity: "low", status: "open" });
    }
    return alerts
      .map((a) => ({ ...a, status: stateMap.get(a.key)?.status ?? "open", note: stateMap.get(a.key)?.note ?? "" }))
      .filter((a) => a.status !== "closed");
  });

export const setAlertState = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; key: string; status: string; note?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "stock.view");
    const status = ["open", "acked", "closed"].includes(data.status) ? data.status : "acked";
    await sql`
      insert into alert_states (org_id, alert_key, status, note, assignee)
      values (${data.orgId}::uuid, ${text(data.key, 120)}, ${status}, ${text(data.note, 300)}, ${context.userId})
      on conflict (org_id, alert_key) do update set status=excluded.status, note=excluded.note, assignee=excluded.assignee, updated_at=now()
    `;
    return { ok: true as const };
  });

export const getReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; kind: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const g = await gate(sql, context.userId, data.orgId, "reports.view");
    const seeCost = can(g.role, jarr(g.grants), jarr(g.revokes), "cost.view");
    const org = data.orgId;
    if (data.kind === "valuation" || data.kind === "onhand" || data.kind === "low") {
      return sql.query(
        `select p.sku, p.name_ar as name, coalesce(sum(b.on_hand),0)::text as qty, coalesce(sum(b.reserved),0)::text as reserved,
                p.reorder_point::text as reorder, case when $2 then p.avg_cost::text else null end as cost,
                case when $2 then coalesce(sum(b.on_hand * p.avg_cost),0)::text else null end as value
         from products p left join stock_balance b on b.product_id=p.id
         where p.org_id=$1::uuid and p.status='active' and p.product_type<>'service'
         group by p.id
         having ($3 = false or (p.reorder_point > 0 and coalesce(sum(b.on_hand),0) <= p.reorder_point))
         order by p.name_ar limit 500`,
        [org, seeCost, data.kind === "low"],
      );
    }
    if (data.kind === "movements") {
      return sql`select l.posted_at::text as posted, l.doc_type as type, l.direction, p.sku, p.name_ar as name, w.name_ar as warehouse, l.qty_base::text as qty
        from ledger l join products p on p.id=l.product_id join warehouses w on w.id=l.warehouse_id
        where l.org_id=${org}::uuid order by l.posted_at desc limit 400`;
    }
    if (data.kind === "expiry") {
      return sql`select p.sku, p.name_ar as name, w.name_ar as warehouse, sb.batch_no as batch, sb.expiry_date::text as expiry, sb.qty::text
        from stock_batch sb join products p on p.id=sb.product_id join warehouses w on w.id=sb.warehouse_id
        where sb.org_id=${org}::uuid and sb.qty>0 order by sb.expiry_date nulls last limit 400`;
    }
    if (data.kind === "slow") {
      return sql.query(
        `select p.sku, p.name_ar as name, coalesce(sum(b.on_hand),0)::text as qty
         from products p join stock_balance b on b.product_id=p.id
         where p.org_id=$1::uuid and p.status='active'
         group by p.id having sum(b.on_hand)>0
         and not exists (select 1 from ledger l where l.product_id=p.id and l.direction='out' and l.posted_at >= now() - make_interval(days => (select slow_days from organizations where id=$1::uuid)))
         order by p.name_ar limit 400`,
        [org],
      );
    }
    if (data.kind === "serials") {
      return sql`select serial_no as serial, p.sku, p.name_ar as name, status, w.name_ar as warehouse
        from stock_serial s join products p on p.id=s.product_id left join warehouses w on w.id=s.warehouse_id
        where s.org_id=${org}::uuid order by serial_no limit 400`;
    }
    return [];
  });

export const listAudit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; q?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "reports.view");
    const q = text(data.q, 60);
    return sql.query(
      `select a.created_at::text as at, a.user_id as "userId", a.action, a.entity, a.entity_id as "entityId", a.detail::text,
              coalesce(u.name, a.user_id) as name
       from audit_log a left join "user" u on u.id = a.user_id
       where a.org_id=$1::uuid and ($2='' or a.action ilike '%'||$2||'%' or a.entity ilike '%'||$2||'%' or a.entity_id ilike '%'||$2||'%')
       order by a.created_at desc limit 300`,
      [data.orgId, q],
    );
  });

export const reorderLines = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "purchasing.view");
    return sql<{ productId: string; sku: string; name: string; onHand: string; reorder: string; suggest: string; supplierId: string | null }>`
      select p.id::text as "productId", p.sku, p.name_ar as name, coalesce(sum(b.on_hand),0)::text as "onHand",
             p.reorder_point::text as reorder,
             greatest(p.reorder_point - coalesce(sum(b.on_hand),0), 1)::text as suggest,
             p.supplier_id::text as "supplierId"
      from products p left join stock_balance b on b.product_id=p.id
      where p.org_id=${data.orgId}::uuid and p.status='active' and p.reorder_point>0 and p.product_type<>'service'
      group by p.id having coalesce(sum(b.on_hand),0) <= p.reorder_point
      order by p.name_ar`;
  });

const aiHits = new Map<string, number[]>();

function consumeAiQuota(userId: string): boolean {
  const now = Date.now();
  const hits = (aiHits.get(userId) ?? []).filter((timestamp) => now - timestamp < 60 * 60 * 1000);
  if (hits.length >= 24) {
    aiHits.set(userId, hits);
    return false;
  }
  hits.push(now);
  aiHits.set(userId, hits);
  // Keep this in-memory limiter bounded in long-lived server processes.
  if (aiHits.size > 2000) {
    for (const [id, timestamps] of aiHits) {
      if (!timestamps.some((timestamp) => now - timestamp < 60 * 60 * 1000)) aiHits.delete(id);
    }
  }
  return true;
}


export const askAssistant = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; question: string; locale: string; history?: Array<{ role: string; text: string }> }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const g = await gate(sql, context.userId, data.orgId, "ai.use");
    const question = text(data.question, 1500);
    if (!question) return { ok: false as const, error: "VALIDATION" };
    if (!process.env.GEMINI_API_KEY?.trim()) return { ok: false as const, error: "AI_NOT_CONFIGURED" };
    if (!consumeAiQuota(context.userId)) return { ok: false as const, error: "RATE" };
    const history = Array.isArray(data.history)
      ? data.history.slice(-8).flatMap((item) => {
          if (!item || typeof item !== "object" || typeof item.text !== "string") return [];
          if (item.role !== "user" && item.role !== "assistant") return [];
          const clean = item.text.trim().slice(0, 1200);
          return clean ? [{ role: item.role === "assistant" ? "model" as const : "user" as const, text: clean }] : [];
        })
      : [];
    const seeCost = can(g.role, jarr(g.grants), jarr(g.revokes), "cost.view");
    const snapshot = await sql.query(
      `select p.sku, p.name_ar as name, coalesce(sum(b.on_hand),0)::text as on_hand, coalesce(sum(b.reserved),0)::text as reserved,
              p.reorder_point::text as reorder ${seeCost ? ", p.avg_cost::text as cost" : ""}
       from products p left join stock_balance b on b.product_id=p.id
       where p.org_id=$1::uuid and p.status='active' and p.product_type<>'service'
       group by p.id order by coalesce(sum(b.on_hand),0) asc limit 40`, [data.orgId],
    );
    const movers = await sql.query(
      `select p.name_ar as name, sum(l.qty_base)::text as qty from ledger l join products p on p.id=l.product_id
       where l.org_id=$1::uuid and l.direction='out' and l.posted_at > now() - interval '30 days'
       group by p.id, p.name_ar order by sum(l.qty_base) desc limit 8`, [data.orgId],
    );
    const lang = data.locale === "en" ? "English" : "Arabic";
    const answer = await callGemini({
      system: `You are Smart Stock AI, an inventory operations analyst for organization "${g.name}". Reply in ${lang}. ` +
        `Use ONLY the latest supplied organization snapshot for current quantities, names, dates, and costs. Never invent data. ` +
        `Use prior conversation messages only to resolve references and follow-up intent, not as a source of current business facts. ` +
        `If data is insufficient, say what is missing. Distinguish observed facts from estimates. ` +
        `Forecasts must state their window, assumptions, and low/medium confidence. ` +
        `Do not accuse employees; unusual activity is only a signal for human review. ` +
        `Never reveal or infer costs when cost fields are absent. Give concise, actionable answers.`,
      prompt: JSON.stringify({ question, stock: snapshot, outboundLast30Days: movers, costingMethod: "moving average" }),
      history,
      maxOutputTokens: 900,
    });
    if (!answer.ok) return { ok: false as const, error: answer.error };
    await sql`insert into ai_log (org_id, user_id, kind, excerpt) values (${data.orgId}::uuid, ${context.userId}, 'chat', ${answer.text.slice(0, 400)})`;
    return { ok: true as const, text: answer.text };
  });

export const extractInvoice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; dataUrl: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "ai.use");
    if (typeof data.dataUrl !== "string" || data.dataUrl.length > 1_800_000) return { ok: false as const, error: "VALIDATION" };
    const image = data.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!image || image[2].length > 1_750_000) return { ok: false as const, error: "VALIDATION" };
    if (!process.env.GEMINI_API_KEY?.trim()) return { ok: false as const, error: "AI_NOT_CONFIGURED" };
    if (!consumeAiQuota(context.userId)) return { ok: false as const, error: "RATE" };
    const raw = await callGemini({
      system: "You extract structured information from supplier invoices. Return valid JSON only, with no markdown.",
      prompt: "Extract this supplier invoice into exactly this JSON shape: " +
        '{"supplierName":string|null,"invoiceNo":string|null,"date":string|null,"currency":string|null,' +
        '"lines":[{"name":string,"qty":number|null,"unit":string|null,"price":number|null}]}. ' +
        "Use null for unreadable values. Do not invent products, quantities, or prices. Return an empty lines array if no lines are legible.",
      image: { mimeType: image[1], data: image[2] }, maxOutputTokens: 1200, responseMimeType: "application/json",
    });
    if (!raw.ok) return { ok: false as const, error: raw.error };
    await sql`insert into ai_log (org_id, user_id, kind, excerpt) values (${data.orgId}::uuid, ${context.userId}, 'invoice', ${raw.text.slice(0, 400)})`;
    const match = raw.text.match(/\{[\s\S]*\}/);
    let parsed: unknown = null;
    try { parsed = match ? JSON.parse(match[0]) : null; } catch { parsed = null; }
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { lines?: unknown }).lines)) {
      return { ok: false as const, error: "UNAVAILABLE" };
    }
    return { ok: true as const, raw: raw.text, parsed };
  });

void catalog;


const FINANCE_SEED = [
  ["1000", "الصندوق", "Cash", "asset"],
  ["1010", "البنوك", "Bank accounts", "asset"],
  ["1100", "العملاء", "Accounts receivable", "asset"],
  ["1200", "المخزون", "Inventory", "asset"],
  ["2000", "الموردون", "Accounts payable", "liability"],
  ["2100", "ضريبة القيمة المضافة المستحقة", "VAT payable", "liability"],
  ["2110", "ضريبة مدخلات قابلة للخصم", "Recoverable input VAT", "asset"],
  ["3000", "رأس المال", "Owner equity", "equity"],
  ["4000", "إيرادات المبيعات", "Sales revenue", "revenue"],
  ["4050", "مردودات المبيعات", "Sales returns", "expense"],
  ["4100", "إيرادات أخرى", "Other income", "revenue"],
  ["5000", "تكلفة البضاعة المباعة", "Cost of goods sold", "expense"],
  ["6000", "مصروفات تشغيلية", "Operating expenses", "expense"],
] as const;

async function ensureFinanceAccounts(sql: Sql, orgId: string) {
  for (const [code, nameAr, nameEn, type] of FINANCE_SEED) {
    await sql`
      insert into finance_accounts (org_id, code, name_ar, name_en, account_type, is_system)
      values (${orgId}::uuid, ${code}, ${nameAr}, ${nameEn}, ${type}, true)
      on conflict (org_id, code) do nothing
    `;
  }
  await sql`
    insert into finance_cash_accounts(org_id,name,account_kind,currency,finance_account_id,created_by)
    select o.id,'الخزينة الرئيسية','cash',o.currency,a.id,o.created_by
    from organizations o join finance_accounts a on a.org_id=o.id and a.code='1000'
    where o.id=${orgId}::uuid on conflict (org_id,finance_account_id) do nothing
  `;
  await sql`
    insert into finance_cash_accounts(org_id,name,account_kind,currency,finance_account_id,created_by)
    select o.id,'الحساب البنكي الرئيسي','bank',o.currency,a.id,o.created_by
    from organizations o join finance_accounts a on a.org_id=o.id and a.code='1010'
    where o.id=${orgId}::uuid on conflict (org_id,finance_account_id) do nothing
  `;
}

function financeDateParts(timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
  }
}

export const getFinanceDashboard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const access = await gate(sql, context.userId, data.orgId, "finance.view");
    await ensureFinanceAccounts(sql, data.orgId);
    const dateParts = financeDateParts(access.timezone);
    const datePart = (type: string) => dateParts.find((part) => part.type === type)?.value ?? "01";
    const localYear = Number(datePart("year"));
    const localMonth = Number(datePart("month"));
    const monthStart = `${localYear}-${String(localMonth).padStart(2, "0")}-01`;
    const nextMonthStart = new Date(Date.UTC(localYear, localMonth, 1)).toISOString().slice(0, 10);
    const totals = await sql.query<{
      revenue: string; expenses: string; cash: string; receivables: string;
      payables: string; journal_count: number; month_debits: string; month_credits: string;
    }>(`
      select
        coalesce(sum(case when a.account_type='revenue' then l.credit-l.debit else 0 end)
          filter (where e.entry_date >= $2::date and e.entry_date < $3::date),0)::text as revenue,
        coalesce(sum(case when a.account_type='expense' then l.debit-l.credit else 0 end)
          filter (where e.entry_date >= $2::date and e.entry_date < $3::date),0)::text as expenses,
        coalesce(sum(case when a.code in ('1000','1010') or pa.code in ('1000','1010') then l.debit-l.credit else 0 end),0)::text as cash,
        coalesce(sum(case when a.code='1100' then l.debit-l.credit else 0 end),0)::text as receivables,
        coalesce(sum(case when a.code='2000' then l.credit-l.debit else 0 end),0)::text as payables,
        count(distinct e.id)::int as journal_count,
        coalesce(sum(l.debit) filter (where e.entry_date >= $2::date and e.entry_date < $3::date),0)::text as month_debits,
        coalesce(sum(l.credit) filter (where e.entry_date >= $2::date and e.entry_date < $3::date),0)::text as month_credits
      from finance_journal_entries e
      join finance_journal_lines l on l.org_id=e.org_id and l.entry_id=e.id
      join finance_accounts a on a.org_id=l.org_id and a.id=l.account_id
      left join finance_accounts pa on pa.org_id=a.org_id and pa.id=a.parent_id
      where e.org_id=$1::uuid and e.status='posted'
    `, [data.orgId, monthStart, nextMonthStart]);
    const recent = await sql.query(`
      select e.id::text as id, e.entry_no as "entryNo", e.entry_date::text as "entryDate",
             e.description, e.source_type as "sourceType", e.reverses_entry_id::text as "reversesEntryId",
             exists(select 1 from finance_journal_entries rx where rx.org_id=e.org_id and rx.reverses_entry_id=e.id) as "isReversed",
             coalesce(sum(l.debit),0)::text as debit, coalesce(sum(l.credit),0)::text as credit,
             count(l.id)::int as "lineCount"
      from finance_journal_entries e
      left join finance_journal_lines l on l.org_id=e.org_id and l.entry_id=e.id
      where e.org_id=$1::uuid and e.status='posted'
      group by e.id order by e.entry_date desc, e.created_at desc limit 12
    `, [data.orgId]);
    const accounts = await sql`
      select a.id::text as id, a.code, a.name_ar as "nameAr", a.name_en as "nameEn", a.account_type as "accountType",
        (case when a.account_type in ('liability','equity','revenue')
          then coalesce(sum(case when e.id is not null then l.credit-l.debit else 0 end),0) else coalesce(sum(case when e.id is not null then l.debit-l.credit else 0 end),0) end)::text as balance
      from finance_accounts a
      left join finance_journal_lines l on l.org_id=a.org_id and l.account_id=a.id
      left join finance_journal_entries e on e.org_id=l.org_id and e.id=l.entry_id and e.status='posted'
      where a.org_id=${data.orgId}::uuid and a.active=true
      group by a.id order by a.code
    `;
    const row = totals[0] ?? { revenue: "0", expenses: "0", cash: "0", receivables: "0", payables: "0", journal_count: 0, month_debits: "0", month_credits: "0" };
    return {
      totals: {
        revenue: row.revenue,
        expenses: row.expenses,
        netProfit: String(Number(row.revenue) - Number(row.expenses)),
        cash: row.cash,
        receivables: row.receivables,
        payables: row.payables,
        journalCount: row.journal_count,
        monthDebits: row.month_debits,
        monthCredits: row.month_credits,
      },
      recent,
      accounts,
    };
  });

export const createJournalEntry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    orgId: string; entryDate: string; description: string; idempotencyKey: string;
    lines: { accountId: string; description?: string; debit: number | string; credit: number | string }[];
  }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "finance.write");
    const description = text(data.description, 500);
    const parsedDate = new Date(`${data.entryDate}T00:00:00.000Z`);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(data.entryDate) &&
      Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === data.entryDate
      ? data.entryDate
      : "";
    const key = text(data.idempotencyKey, 120);
    if (!description || !date || !key || !Array.isArray(data.lines) || data.lines.length < 2 || data.lines.length > 100) {
      return { ok: false as const, error: "VALIDATION" };
    }
    const lines = data.lines.map((line) => ({
      accountId: uuid(line.accountId),
      description: text(line.description, 240),
      debitUnits: financeAmountUnits(line.debit),
      creditUnits: financeAmountUnits(line.credit),
    }));
    if (lines.some((line) => !line.accountId || line.debitUnits === null || line.creditUnits === null ||
      (line.debitUnits > 0) === (line.creditUnits > 0))) {
      return { ok: false as const, error: "VALIDATION" };
    }
    const debitUnits = lines.reduce((sum, line) => sum + BigInt(line.debitUnits ?? 0), 0n);
    const creditUnits = lines.reduce((sum, line) => sum + BigInt(line.creditUnits ?? 0), 0n);
    if (debitUnits > BigInt(Number.MAX_SAFE_INTEGER) || creditUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
      return { ok: false as const, error: "VALIDATION" };
    }
    if (debitUnits !== creditUnits || debitUnits <= 0n) return { ok: false as const, error: "FINANCE_UNBALANCED_ENTRY" };

    return sql.transaction(async (tx) => {
      const existing = await tx<{ id: string }>`
        select id::text as id from finance_journal_entries
        where org_id=${data.orgId}::uuid and idempotency_key=${key} limit 1
      `;
      if (existing[0]) return { ok: true as const, id: existing[0].id, duplicate: true };
      const ids = [...new Set(lines.map((line) => line.accountId as string))];
      const found = await tx.query<{ id: string }>(
        "select id::text as id from finance_accounts where org_id=$1::uuid and active=true and id=any($2::uuid[])",
        [data.orgId, ids],
      );
      if (found.length !== ids.length) return { ok: false as const, error: "FINANCE_ACCOUNT_NOT_FOUND" };
      const entryId = crypto.randomUUID();
      const entryNo = `FJ-${date.replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      await tx`
        insert into finance_journal_entries (id, org_id, entry_no, entry_date, description, idempotency_key, created_by)
        values (${entryId}::uuid, ${data.orgId}::uuid, ${entryNo}, ${date}::date, ${description}, ${key}, ${context.userId})
      `;
      for (const [index, line] of lines.entries()) {
        await tx`
          insert into finance_journal_lines (org_id, entry_id, line_no, account_id, description, debit, credit)
          values (${data.orgId}::uuid, ${entryId}::uuid, ${index + 1}, ${line.accountId}::uuid,
            ${line.description}, ${financeUnitsToDecimal(line.debitUnits ?? 0)}, ${financeUnitsToDecimal(line.creditUnits ?? 0)})
        `;
      }
      await tx`
        update finance_journal_entries set status='posted', posted_by=${context.userId}
        where org_id=${data.orgId}::uuid and id=${entryId}::uuid
      `;
      await audit(tx, data.orgId, context.userId, "post", "finance_journal", entryId, {
        entryNo,
        debit: financeUnitsToDecimal(Number(debitUnits)),
        credit: financeUnitsToDecimal(Number(creditUnits)),
        lines: lines.length,
      });
      return { ok: true as const, id: entryId, entryNo, duplicate: false };
    });
  });

export const reverseJournalEntry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; entryId: string; reason: string; idempotencyKey: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const access = await gate(sql, context.userId, data.orgId, "finance.write");
    const entryId = uuid(data.entryId);
    const reason = text(data.reason, 500);
    const key = text(data.idempotencyKey, 120);
    if (!entryId || !reason || !key) return { ok: false as const, error: "VALIDATION" };
    return sql.transaction(async (tx) => {
      const existing = await tx<{ id: string }>`
        select id::text as id from finance_journal_entries where org_id=${data.orgId}::uuid and idempotency_key=${key}
      `;
      if (existing[0]) return { ok: true as const, id: existing[0].id, duplicate: true };
      const original = await tx<{ id: string; entry_no: string; entry_date: string; description: string; status: string; source_type: string }>`
        select id::text as id, entry_no, entry_date::text as entry_date, description, status, source_type
        from finance_journal_entries where org_id=${data.orgId}::uuid and id=${entryId}::uuid for update
      `;
      if (!original[0] || original[0].status !== "posted") return { ok: false as const, error: "FINANCE_ENTRY_NOT_FOUND" };
      if (original[0].source_type !== "manual") return { ok: false as const, error: "FINANCE_SOURCE_REVERSAL_REQUIRED" };
      const already = await tx`select id from finance_journal_entries where org_id=${data.orgId}::uuid and reverses_entry_id=${entryId}::uuid limit 1`;
      if (already[0]) return { ok: false as const, error: "FINANCE_ALREADY_REVERSED" };
      const reverseId = crypto.randomUUID();
      const dateParts = financeDateParts(access.timezone);
      const part = (type: string) => dateParts.find((item) => item.type === type)?.value ?? "01";
      const date = `${part("year")}-${part("month")}-${part("day")}`;
      const entryNo = `FJ-${date.replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      await tx`
        insert into finance_journal_entries (id, org_id, entry_no, entry_date, description, source_type,
          source_id, idempotency_key, reverses_entry_id, created_by)
        values (${reverseId}::uuid, ${data.orgId}::uuid, ${entryNo}, ${date}::date,
          ${`عكس ${original[0].entry_no}: ${reason}`}, 'reversal', ${entryId}, ${key}, ${entryId}::uuid, ${context.userId})
      `;
      await tx`
        insert into finance_journal_lines (org_id, entry_id, line_no, account_id, description, debit, credit)
        select org_id, ${reverseId}::uuid, line_no, account_id, ${reason}, credit, debit
        from finance_journal_lines where org_id=${data.orgId}::uuid and entry_id=${entryId}::uuid
      `;
      await tx`
        update finance_journal_entries set status='posted', posted_by=${context.userId}
        where org_id=${data.orgId}::uuid and id=${reverseId}::uuid
      `;
      await audit(tx, data.orgId, context.userId, "reverse", "finance_journal", entryId, { reversalId: reverseId, reason });
      return { ok: true as const, id: reverseId, entryNo, duplicate: false };
    });
  });

// Phase 2 finance operations: cash/bank accounts, automated-document ledger,
// customer/supplier balances and statement reconciliation.
export const getFinanceOperations = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "finance.view");
    await ensureFinanceAccounts(sql, data.orgId);
    const cashAccounts = await sql.query<any>(`
      select ca.id::text as id, ca.name, ca.account_kind as "accountKind", ca.currency,
        ca.finance_account_id::text as "financeAccountId", fa.code as "accountCode",
        (ca.opening_balance+coalesce(sum(case when je.status='posted' then jl.debit-jl.credit else 0 end),0))::text as balance
      from finance_cash_accounts ca
      join finance_accounts fa on fa.org_id=ca.org_id and fa.id=ca.finance_account_id
      left join finance_journal_lines jl on jl.org_id=ca.org_id and jl.account_id=ca.finance_account_id
      left join finance_journal_entries je on je.org_id=jl.org_id and je.id=jl.entry_id
      where ca.org_id=$1::uuid and ca.active=true
      group by ca.id,fa.code order by ca.account_kind,ca.name`, [data.orgId]);
    const documents = await sql.query<any>(`
      select fd.id::text as id, fd.document_type as "documentType", fd.document_no as "documentNo",
        fd.partner_type as "partnerType", fd.partner_id::text as "partnerId",
        case when fd.partner_type='customer' then c.name_ar else s.name_ar end as "partnerNameAr",
        case when fd.partner_type='customer' then c.name_en else s.name_en end as "partnerNameEn",
        fd.document_date::text as "documentDate", fd.due_date::text as "dueDate", fd.currency,
        fd.subtotal::text, fd.tax_amount::text as "taxAmount", fd.total_amount::text as "totalAmount",
        fd.paid_amount::text as "paidAmount", (fd.total_amount-fd.paid_amount)::text as outstanding, fd.status
      from finance_documents fd
      left join customers c on fd.partner_type='customer' and c.org_id=fd.org_id and c.id=fd.partner_id
      left join suppliers s on fd.partner_type='supplier' and s.org_id=fd.org_id and s.id=fd.partner_id
      where fd.org_id=$1::uuid and fd.status in ('open','partial')
      order by coalesce(fd.due_date,fd.document_date),fd.document_date desc limit 100`, [data.orgId]);
    const transactions = await sql.query<any>(`
      select t.id::text as id,t.transaction_no as "transactionNo",t.transaction_type as "transactionType",
        t.transaction_date::text as "transactionDate",t.amount::text,t.currency,t.reference,t.description,t.status,
        ca.name as "cashAccountName",t.journal_entry_id::text as "journalEntryId"
      from finance_cash_transactions t join finance_cash_accounts ca on ca.org_id=t.org_id and ca.id=t.cash_account_id
      where t.org_id=$1::uuid order by t.transaction_date desc,t.created_at desc limit 20`, [data.orgId]);
    const statementSummary = await sql.query<any>(`
      select count(*)::int as "unmatchedCount",coalesce(sum(debit-credit),0)::text as "unmatchedNet"
      from finance_bank_statement_lines where org_id=$1::uuid and matched_transaction_id is null`, [data.orgId]);
    const aging = await sql.query<any>(`
      select document_type as "documentType",
        coalesce(sum(total_amount-paid_amount) filter(where due_date is null or due_date>=current_date),0)::text as current,
        coalesce(sum(total_amount-paid_amount) filter(where due_date<current_date and due_date>=current_date-30),0)::text as "days30",
        coalesce(sum(total_amount-paid_amount) filter(where due_date<current_date-30 and due_date>=current_date-60),0)::text as "days60",
        coalesce(sum(total_amount-paid_amount) filter(where due_date<current_date-60),0)::text as "over60"
      from finance_documents where org_id=$1::uuid and status in ('open','partial') group by document_type`, [data.orgId]);
    const statementLines = await sql.query<any>(`
      select sl.id::text as id,sl.external_reference as "externalReference",sl.transaction_date::text as "transactionDate",
        sl.description,sl.debit::text,sl.credit::text,ca.name as "cashAccountName",ca.id::text as "cashAccountId"
      from finance_bank_statement_lines sl join finance_cash_accounts ca on ca.org_id=sl.org_id and ca.id=sl.cash_account_id
      where sl.org_id=$1::uuid and sl.matched_transaction_id is null
      order by sl.transaction_date desc,sl.imported_at desc limit 100`, [data.orgId]);
    const pendingEvents = await sql.query<any>(`
      select pe.id::text as id,pe.source_document_id::text as "sourceDocumentId",d.doc_no as "documentNo",
        d.doc_type as "documentType",pe.message,pe.created_at::text as "createdAt"
      from finance_pending_events pe join documents d on d.org_id=pe.org_id and d.id=pe.source_document_id
      where pe.org_id=$1::uuid and pe.status='pending' order by pe.created_at desc limit 50`, [data.orgId]);
    return { cashAccounts, documents, transactions, statementLines, pendingEvents,
      statementSummary: statementSummary[0] ?? { unmatchedCount: 0, unmatchedNet: "0" }, aging };
  });

export const createFinanceCashAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; name: string; accountKind: "cash" | "bank" | "wallet"; currency?: string; openingBalance?: number | string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const access = await gate(sql, context.userId, data.orgId, "finance.write");
    await ensureFinanceAccounts(sql, data.orgId);
    const name = text(data.name, 120);
    const kind = data.accountKind;
    const currency = text(data.currency, 8).toUpperCase() || access.currency;
    const openingUnits = financeAmountUnits(data.openingBalance ?? "0");
    if (!name || !["cash", "bank", "wallet"].includes(kind) || currency !== access.currency || openingUnits === null || openingUnits < 0) return { ok: false as const, error: currency !== access.currency ? "FINANCE_CURRENCY_NOT_ENABLED" : "VALIDATION" };
    return sql.transaction(async (tx) => {
      const rootCode = kind === "cash" ? "1000" : "1010";
      const parent = await tx<{ id: string }>`select id::text as id from finance_accounts where org_id=${data.orgId}::uuid and code=${rootCode}`;
      if (!parent[0]) return { ok: false as const, error: "FINANCE_ACCOUNT_NOT_FOUND" };
      const accountId = crypto.randomUUID();
      const code = `${rootCode}-${accountId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
      await tx`
        insert into finance_accounts(id,org_id,code,name_ar,name_en,account_type,parent_id,is_system)
        values(${accountId}::uuid,${data.orgId}::uuid,${code},${name},${name},'asset',${parent[0].id}::uuid,false)
      `;
      const rows = await tx<{ id: string }>`
        insert into finance_cash_accounts(org_id,name,account_kind,currency,finance_account_id,created_by)
        values(${data.orgId}::uuid,${name},${kind},${currency},${accountId}::uuid,${context.userId}) returning id::text as id
      `;
      if (openingUnits > 0) {
        const equity = await tx<{ id: string }>`select id::text as id from finance_accounts where org_id=${data.orgId}::uuid and code='3000'`;
        if (!equity[0]) throw new Error("SS:FINANCE_ACCOUNT_NOT_FOUND");
        await tx`select ss_finance_post_entry(${data.orgId}::uuid,${context.userId},'cash_account_opening',${rows[0].id},current_date,${`رصيد افتتاحي ${name}`},${`cash-opening:${rows[0].id}`},${JSON.stringify([
          { accountId, debit: financeUnitsToDecimal(openingUnits), credit: 0, description: "رصيد افتتاحي للخزينة" },
          { accountId: equity[0].id, debit: 0, credit: financeUnitsToDecimal(openingUnits), description: "حقوق ملكية افتتاحية" },
        ])}::jsonb)`;
      }
      await audit(tx, data.orgId, context.userId, "create", "finance_cash_account", rows[0].id, { name, kind, currency, openingBalance: financeUnitsToDecimal(openingUnits) });
      return { ok: true as const, id: rows[0].id, accountCode: code };
    });
  });

export const postFinanceCashTransaction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    orgId: string; transactionType: "receipt" | "payment" | "transfer" | "expense" | "income";
    transactionDate: string; cashAccountId: string; destinationCashAccountId?: string;
    partnerType?: "customer" | "supplier" | "other"; partnerId?: string; offsetAccountId?: string;
    amount: number | string; reference?: string; description: string; idempotencyKey: string;
    allocations?: { financeDocumentId: string; amount: number | string }[];
  }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "finance.write");
    await ensureFinanceAccounts(sql, data.orgId);
    const amountUnits = financeAmountUnits(data.amount);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(data.transactionDate) &&
      Number.isFinite(new Date(`${data.transactionDate}T00:00:00.000Z`).getTime()) &&
      new Date(`${data.transactionDate}T00:00:00.000Z`).toISOString().slice(0, 10) === data.transactionDate;
    const cashAccountId = uuid(data.cashAccountId);
    const destinationCashAccountId = data.destinationCashAccountId ? uuid(data.destinationCashAccountId) : null;
    const offsetAccountId = data.offsetAccountId ? uuid(data.offsetAccountId) : null;
    const key = text(data.idempotencyKey, 120);
    const description = text(data.description, 500);
    if (amountUnits === null || amountUnits <= 0 || !validDate || !cashAccountId || !key || !description ||
      (data.transactionType === "transfer" && !destinationCashAccountId)) return { ok: false as const, error: "VALIDATION" };
    const allocations = (data.allocations ?? []).map((item) => ({
      financeDocumentId: uuid(item.financeDocumentId),
      amountUnits: financeAmountUnits(item.amount),
    }));
    if (allocations.some((item) => !item.financeDocumentId || item.amountUnits === null || item.amountUnits <= 0)) {
      return { ok: false as const, error: "FINANCE_ALLOCATION_INVALID" };
    }
    const allocated = allocations.reduce((sum, item) => sum + BigInt(item.amountUnits ?? 0), 0n);
    if (allocated > BigInt(amountUnits)) return { ok: false as const, error: "FINANCE_OVER_ALLOCATION" };
    try {
      const rows = await sql<{ id: string }>`
        select ss_finance_post_cash(${data.orgId}::uuid,${context.userId},${JSON.stringify({
          transactionType: data.transactionType, transactionDate: data.transactionDate,
          cashAccountId, destinationCashAccountId, partnerType: data.partnerType ?? "",
          partnerId: uuid(data.partnerId) ?? "", offsetAccountId: offsetAccountId ?? "",
          amount: financeUnitsToDecimal(amountUnits), reference: text(data.reference, 160), description,
          idempotencyKey: key,
          allocations: allocations.map((item) => ({ financeDocumentId: item.financeDocumentId, amount: financeUnitsToDecimal(item.amountUnits ?? 0) })),
        })}::jsonb)::text as id`;
      return { ok: true as const, id: rows[0].id };
    } catch (error) {
      const known = biz(error);
      if (known) return known;
      const message = error instanceof Error ? error.message : String(error);
      const match = message.match(/SS:([A-Z0-9_]+)/);
      if (match) return { ok: false as const, error: match[1] };
      throw error;
    }
  });

export const importFinanceBankStatementLines = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; cashAccountId: string; lines: { externalReference?: string; transactionDate: string; description?: string; debit: number | string; credit: number | string }[] }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "finance.write");
    const accountId = uuid(data.cashAccountId);
    if (!accountId || !Array.isArray(data.lines) || data.lines.length === 0 || data.lines.length > 500) return { ok: false as const, error: "VALIDATION" };
    const lines = data.lines.map((line) => ({
      reference: text(line.externalReference, 160), date: line.transactionDate,
      description: text(line.description, 500), debit: financeAmountUnits(line.debit), credit: financeAmountUnits(line.credit),
    }));
    if (lines.some((line) => !/^\d{4}-\d{2}-\d{2}$/.test(line.date) ||
      !Number.isFinite(new Date(`${line.date}T00:00:00.000Z`).getTime()) ||
      new Date(`${line.date}T00:00:00.000Z`).toISOString().slice(0, 10) !== line.date ||
      line.debit === null || line.credit === null || ((line.debit > 0) === (line.credit > 0)))) return { ok: false as const, error: "VALIDATION" };
    return sql.transaction(async (tx) => {
      const found = await tx<{ id: string }>`select id::text as id from finance_cash_accounts where org_id=${data.orgId}::uuid and id=${accountId}::uuid and account_kind='bank' and active`;
      if (!found[0]) return { ok: false as const, error: "FINANCE_CASH_ACCOUNT_NOT_FOUND" };
      let inserted = 0;
      for (const line of lines) {
        const result = await tx`
          insert into finance_bank_statement_lines(org_id,cash_account_id,external_reference,transaction_date,description,debit,credit)
          values(${data.orgId}::uuid,${accountId}::uuid,${line.reference},${line.date}::date,${line.description},
            ${financeUnitsToDecimal(line.debit ?? 0)},${financeUnitsToDecimal(line.credit ?? 0)})
          on conflict do nothing returning id
        `;
        inserted += result.length;
      }
      await audit(tx, data.orgId, context.userId, "import", "finance_bank_statement", accountId, { rows: lines.length, inserted });
      return { ok: true as const, inserted, skipped: lines.length - inserted };
    });
  });

export const matchFinanceBankStatementLine = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; statementLineId: string; cashTransactionId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "finance.write");
    const lineId = uuid(data.statementLineId); const transactionId = uuid(data.cashTransactionId);
    if (!lineId || !transactionId) return { ok: false as const, error: "VALIDATION" };
    try {
      await sql`select ss_finance_match_bank_line(${data.orgId}::uuid,${context.userId},${lineId}::uuid,${transactionId}::uuid)`;
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const match = message.match(/SS:([A-Z0-9_]+)/);
      if (match) return { ok: false as const, error: match[1] };
      throw error;
    }
  });


export const getFinanceReports = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; fromDate: string; toDate: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "finance.view");
    const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(new Date(`${value}T00:00:00.000Z`).getTime()) &&
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
    if (!valid(data.fromDate) || !valid(data.toDate) || data.fromDate > data.toDate) return { ok: false as const, error: "VALIDATION" };
    const trialBalance = await sql.query(`
      select a.id::text as id,a.code,a.name_ar as "nameAr",a.name_en as "nameEn",a.account_type as "accountType",
        coalesce(sum(case when e.id is not null then l.debit else 0 end),0)::text as debit,
        coalesce(sum(case when e.id is not null then l.credit else 0 end),0)::text as credit,
        (case when a.account_type in ('liability','equity','revenue')
          then coalesce(sum(case when e.id is not null then l.credit-l.debit else 0 end),0)
          else coalesce(sum(case when e.id is not null then l.debit-l.credit else 0 end),0) end)::text as balance
      from finance_accounts a left join finance_journal_lines l on l.org_id=a.org_id and l.account_id=a.id
      left join finance_journal_entries e on e.org_id=l.org_id and e.id=l.entry_id and e.status='posted' and e.entry_date<=$3::date
      where a.org_id=$1::uuid group by a.id order by a.code`, [data.orgId, data.fromDate, data.toDate]);
    const income = await sql.query(`
      select coalesce(sum(l.credit-l.debit) filter(where a.account_type='revenue'),0)::text as revenue,
        coalesce(sum(l.debit-l.credit) filter(where a.code='5000'),0)::text as cost_of_goods,
        coalesce(sum(l.debit-l.credit) filter(where a.account_type='expense' and a.code<>'5000'),0)::text as operating_expenses,
        coalesce(sum(l.debit-l.credit) filter(where a.account_type='expense'),0)::text as total_expenses
      from finance_journal_entries e join finance_journal_lines l on l.org_id=e.org_id and l.entry_id=e.id
      join finance_accounts a on a.org_id=l.org_id and a.id=l.account_id
      where e.org_id=$1::uuid and e.status='posted' and e.entry_date between $2::date and $3::date`, [data.orgId, data.fromDate, data.toDate]);
    const cashflow = await sql.query(`
      select coalesce(sum(l.debit),0)::text as inflows,
        coalesce(sum(l.credit),0)::text as outflows,
        '0'::text as transfers
      from finance_journal_entries e join finance_journal_lines l on l.org_id=e.org_id and l.entry_id=e.id
      join finance_accounts a on a.org_id=l.org_id and a.id=l.account_id
      left join finance_accounts pa on pa.org_id=a.org_id and pa.id=a.parent_id
      where e.org_id=$1::uuid and e.status='posted' and e.entry_date between $2::date and $3::date
        and (a.code in ('1000','1010') or pa.code in ('1000','1010'))`, [data.orgId, data.fromDate, data.toDate]);
    const inventory = await sql.query(`
      select coalesce(sum(sb.on_hand*p.avg_cost),0)::text as value,
        coalesce(sum(sb.on_hand),0)::text as units
      from stock_balance sb join products p on p.org_id=sb.org_id and p.id=sb.product_id
      where sb.org_id=$1::uuid`, [data.orgId]);
    const balanceSheet = await sql.query(`
      select coalesce(sum(l.debit-l.credit) filter(where a.account_type='asset'),0)::text as assets,
        coalesce(sum(l.credit-l.debit) filter(where a.account_type='liability'),0)::text as liabilities,
        (coalesce(sum(l.credit-l.debit) filter(where a.account_type='equity'),0)
          + coalesce(sum(l.credit-l.debit) filter(where a.account_type='revenue'),0)
          - coalesce(sum(l.debit-l.credit) filter(where a.account_type='expense'),0))::text as equity
      from finance_journal_entries e join finance_journal_lines l on l.org_id=e.org_id and l.entry_id=e.id
      join finance_accounts a on a.org_id=l.org_id and a.id=l.account_id
      where e.org_id=$1::uuid and e.status='posted' and e.entry_date<=$2::date`, [data.orgId, data.toDate]);
    const incomeRow = income[0] ?? { revenue: "0", cost_of_goods: "0", operating_expenses: "0", total_expenses: "0" };
    const cashRow = cashflow[0] ?? { inflows: "0", outflows: "0", transfers: "0" };
    return { ok: true as const, trialBalance, incomeStatement: {
      revenue: incomeRow.revenue, costOfGoods: incomeRow.cost_of_goods,
      grossProfit: String(Number(incomeRow.revenue)-Number(incomeRow.cost_of_goods)),
      operatingExpenses: incomeRow.operating_expenses,
      netProfit: String(Number(incomeRow.revenue)-Number(incomeRow.total_expenses)),
    }, balanceSheet: balanceSheet[0] ?? { assets: "0", liabilities: "0", equity: "0" },
    cashflow: { ...cashRow, net: String(Number(cashRow.inflows)-Number(cashRow.outflows)) }, inventory: inventory[0] ?? { value: "0", units: "0" } };
  });


export const reverseFinanceCashTransaction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { orgId: string; transactionId: string; reason: string; idempotencyKey: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await gate(sql, context.userId, data.orgId, "finance.write");
    const transactionId = uuid(data.transactionId);
    const reason = text(data.reason, 300);
    const key = text(data.idempotencyKey, 120);
    if (!transactionId || !reason || !key) return { ok: false as const, error: "VALIDATION" };
    try {
      const rows = await sql<{ id: string }>`select ss_finance_reverse_cash(${data.orgId}::uuid,${context.userId},${transactionId}::uuid,${reason},${key})::text as id`;
      return { ok: true as const, id: rows[0].id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const match = message.match(/SS:([A-Z0-9_]+)/);
      if (match) return { ok: false as const, error: match[1] };
      throw error;
    }
  });
