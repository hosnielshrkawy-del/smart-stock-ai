-- Smart Stock AI SaaS foundation.
-- Tenant context is injected by the authenticated server middleware into each
-- database transaction. RLS is forced so table-owner connections do not bypass it.

alter table organizations
  add column if not exists country_code text not null default 'EG',
  add column if not exists onboarding_completed_at timestamptz;

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name_ar text not null,
  name_en text not null default '',
  address text not null default '',
  city text not null default '',
  phone text not null default '',
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, code),
  unique (org_id, id)
);
create unique index if not exists branches_one_default_per_org_idx
  on branches (org_id) where is_default;

alter table warehouses add column if not exists branch_id uuid;
insert into branches (org_id, code, name_ar, name_en, is_default)
select o.id, 'MAIN', 'الفرع الرئيسي', 'Main branch', true
from organizations o
where not exists (select 1 from branches b where b.org_id = o.id);
update warehouses w
set branch_id = b.id
from branches b
where b.org_id = w.org_id and b.is_default and w.branch_id is null;
alter table warehouses alter column branch_id set not null;
create unique index if not exists warehouses_org_id_id_uq on warehouses (org_id, id);
create index if not exists warehouses_org_branch_idx on warehouses (org_id, branch_id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'warehouses_branch_tenant_fk') then
    alter table warehouses add constraint warehouses_branch_tenant_fk
      foreign key (org_id, branch_id) references branches (org_id, id) not valid;
  end if;
end $$;

-- Add the missing tenant key to product-unit mappings so their relationship
-- cannot join a product in one organization to a unit in another.
alter table product_units add column if not exists org_id uuid;
update product_units pu set org_id = p.org_id
from products p where p.id = pu.product_id and pu.org_id is null;
alter table product_units alter column org_id set not null;

create table if not exists saas_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null,
  name_en text not null,
  description text not null default '',
  currency text not null default 'EGP',
  monthly_price_minor bigint,
  annual_price_minor bigint,
  limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (monthly_price_minor is null or monthly_price_minor >= 0),
  check (annual_price_minor is null or annual_price_minor >= 0)
);
insert into saas_plans (code, name_ar, name_en, description, currency, is_public, sort_order)
values
  ('trial', 'تجربة مجانية', 'Free trial', '14-day trial; no payment method is required by the foundation.', 'EGP', false, 0),
  ('starter', 'البداية', 'Starter', 'For small shops and teams.', 'EGP', true, 1),
  ('professional', 'الاحترافية', 'Professional', 'For growing businesses.', 'EGP', true, 2),
  ('business', 'الشركات', 'Business', 'For larger multi-branch organizations.', 'EGP', true, 3)
on conflict (code) do nothing;

create table if not exists saas_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  plan_id uuid not null references saas_plans(id),
  status text not null check (status in ('trialing','active','past_due','paused','canceled','expired')),
  billing_cycle text not null default 'trial' check (billing_cycle in ('trial','monthly','annual')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  check (trial_ends_at is null or trial_started_at is not null)
);
create index if not exists saas_subscriptions_org_idx
  on saas_subscriptions (org_id, created_at desc);
create unique index if not exists saas_one_live_subscription_per_org_idx
  on saas_subscriptions (org_id)
  where status in ('trialing','active','past_due','paused');

create table if not exists saas_usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id text,
  feature text not null,
  quantity numeric(18,4) not null default 1 check (quantity > 0),
  unit text not null default 'request',
  estimated_cost_minor bigint,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists saas_usage_org_feature_time_idx
  on saas_usage_events (org_id, feature, occurred_at desc);

create table if not exists saas_feature_overrides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  feature_key text not null,
  enabled boolean,
  limit_value numeric(18,4),
  expires_at timestamptz,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, feature_key)
);

create table if not exists saas_platform_admins (
  user_id text primary key,
  role text not null check (role in ('support','operations','super_admin')),
  enabled boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Composite unique keys used by tenant-aware foreign keys.
create unique index if not exists categories_org_id_id_uq on categories (org_id, id);
create unique index if not exists units_org_id_id_uq on units (org_id, id);
create unique index if not exists suppliers_org_id_id_uq on suppliers (org_id, id);
create unique index if not exists customers_org_id_id_uq on customers (org_id, id);
create unique index if not exists products_org_id_id_uq on products (org_id, id);
create unique index if not exists warehouses_org_id_id_uq on warehouses (org_id, id);
create unique index if not exists locations_org_id_id_uq on locations (org_id, id);
create unique index if not exists document_lines_org_id_id_uq on document_lines (org_id, id);
create unique index if not exists documents_org_id_id_uq on documents (org_id, id);
create unique index if not exists purchase_orders_org_id_id_uq on purchase_orders (org_id, id);
create unique index if not exists sales_orders_org_id_id_uq on sales_orders (org_id, id);
create unique index if not exists stocktakes_org_id_id_uq on stocktakes (org_id, id);
create unique index if not exists boms_org_id_id_uq on boms (org_id, id);

-- NOT VALID preserves legacy rows for a controlled validation pass while
-- enforcing tenant consistency for every new or updated row immediately.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'categories_parent_tenant_fk') then
    alter table categories add constraint categories_parent_tenant_fk
      foreign key (org_id, parent_id) references categories (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'locations_warehouse_tenant_fk') then
    alter table locations add constraint locations_warehouse_tenant_fk
      foreign key (org_id, warehouse_id) references warehouses (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'locations_parent_tenant_fk') then
    alter table locations add constraint locations_parent_tenant_fk
      foreign key (org_id, parent_id) references locations (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_category_tenant_fk') then
    alter table products add constraint products_category_tenant_fk
      foreign key (org_id, category_id) references categories (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_unit_tenant_fk') then
    alter table products add constraint products_unit_tenant_fk
      foreign key (org_id, base_unit_id) references units (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_supplier_tenant_fk') then
    alter table products add constraint products_supplier_tenant_fk
      foreign key (org_id, supplier_id) references suppliers (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_parent_tenant_fk') then
    alter table products add constraint products_parent_tenant_fk
      foreign key (org_id, parent_id) references products (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'product_units_product_tenant_fk') then
    alter table product_units add constraint product_units_product_tenant_fk
      foreign key (org_id, product_id) references products (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'product_units_unit_tenant_fk') then
    alter table product_units add constraint product_units_unit_tenant_fk
      foreign key (org_id, unit_id) references units (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_warehouse_tenant_fk') then
    alter table documents add constraint documents_warehouse_tenant_fk
      foreign key (org_id, warehouse_id) references warehouses (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_warehouse_to_tenant_fk') then
    alter table documents add constraint documents_warehouse_to_tenant_fk
      foreign key (org_id, warehouse_to_id) references warehouses (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'document_lines_document_tenant_fk') then
    alter table document_lines add constraint document_lines_document_tenant_fk
      foreign key (org_id, document_id) references documents (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'document_lines_product_tenant_fk') then
    alter table document_lines add constraint document_lines_product_tenant_fk
      foreign key (org_id, product_id) references products (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'document_lines_unit_tenant_fk') then
    alter table document_lines add constraint document_lines_unit_tenant_fk
      foreign key (org_id, unit_id) references units (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchase_orders_supplier_tenant_fk') then
    alter table purchase_orders add constraint purchase_orders_supplier_tenant_fk
      foreign key (org_id, supplier_id) references suppliers (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchase_orders_warehouse_tenant_fk') then
    alter table purchase_orders add constraint purchase_orders_warehouse_tenant_fk
      foreign key (org_id, warehouse_id) references warehouses (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchase_lines_order_tenant_fk') then
    alter table purchase_lines add constraint purchase_lines_order_tenant_fk
      foreign key (org_id, order_id) references purchase_orders (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchase_lines_product_tenant_fk') then
    alter table purchase_lines add constraint purchase_lines_product_tenant_fk
      foreign key (org_id, product_id) references products (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchase_lines_unit_tenant_fk') then
    alter table purchase_lines add constraint purchase_lines_unit_tenant_fk
      foreign key (org_id, unit_id) references units (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_orders_customer_tenant_fk') then
    alter table sales_orders add constraint sales_orders_customer_tenant_fk
      foreign key (org_id, customer_id) references customers (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_orders_warehouse_tenant_fk') then
    alter table sales_orders add constraint sales_orders_warehouse_tenant_fk
      foreign key (org_id, warehouse_id) references warehouses (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_lines_order_tenant_fk') then
    alter table sales_lines add constraint sales_lines_order_tenant_fk
      foreign key (org_id, order_id) references sales_orders (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_lines_product_tenant_fk') then
    alter table sales_lines add constraint sales_lines_product_tenant_fk
      foreign key (org_id, product_id) references products (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_lines_unit_tenant_fk') then
    alter table sales_lines add constraint sales_lines_unit_tenant_fk
      foreign key (org_id, unit_id) references units (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stocktakes_warehouse_tenant_fk') then
    alter table stocktakes add constraint stocktakes_warehouse_tenant_fk
      foreign key (org_id, warehouse_id) references warehouses (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stocktake_lines_stocktake_tenant_fk') then
    alter table stocktake_lines add constraint stocktake_lines_stocktake_tenant_fk
      foreign key (org_id, stocktake_id) references stocktakes (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stocktake_lines_product_tenant_fk') then
    alter table stocktake_lines add constraint stocktake_lines_product_tenant_fk
      foreign key (org_id, product_id) references products (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'boms_product_tenant_fk') then
    alter table boms add constraint boms_product_tenant_fk
      foreign key (org_id, product_id) references products (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bom_lines_bom_tenant_fk') then
    alter table bom_lines add constraint bom_lines_bom_tenant_fk
      foreign key (org_id, bom_id) references boms (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bom_lines_product_tenant_fk') then
    alter table bom_lines add constraint bom_lines_product_tenant_fk
      foreign key (org_id, product_id) references products (org_id, id) not valid;
  end if;
end $$;

create or replace function ss_current_user_id() returns text
language sql stable
as $$ select nullif(current_setting('app.user_id', true), '') $$;

create or replace function ss_current_user_org_ids() returns uuid[]
language sql stable
as $$
  select coalesce(
    string_to_array(nullif(current_setting('app.org_ids', true), ''), ',')::uuid[],
    '{}'::uuid[]
  )
$$;

-- Global organization directory: users see only organizations they belong to,
-- plus the organization they are in the process of creating.
alter table organizations enable row level security;
alter table organizations force row level security;
drop policy if exists organizations_tenant_isolation on organizations;
create policy organizations_tenant_isolation on organizations
  using (id = any(ss_current_user_org_ids()) or created_by = ss_current_user_id())
  with check (created_by = ss_current_user_id() or id = any(ss_current_user_org_ids()));

alter table memberships enable row level security;
alter table memberships force row level security;
drop policy if exists memberships_tenant_isolation on memberships;
create policy memberships_tenant_isolation on memberships
  using (user_id = ss_current_user_id() or org_id = any(ss_current_user_org_ids()))
  with check (
    org_id = any(ss_current_user_org_ids())
    or (user_id = ss_current_user_id() and exists (
      select 1 from organizations o
      where o.id = memberships.org_id and o.created_by = ss_current_user_id()
    ))
  );

-- All application tables carrying org_id are protected by the same tenant list.
do $$
declare t text;
begin
  foreach t in array array[
    'categories','units','warehouses','branches','locations','suppliers','customers',
    'products','product_units','doc_counters','documents','document_lines','ledger',
    'stock_balance','stock_batch','stock_serial','purchase_orders','purchase_lines',
    'sales_orders','sales_lines','stocktakes','stocktake_lines','boms','bom_lines',
    'custom_fields','alert_states','audit_log','ai_log','saas_subscriptions','saas_usage_events','saas_feature_overrides'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists %I on %I', t || '_tenant_isolation', t);
    execute format(
      'create policy %I on %I using (org_id = any(ss_current_user_org_ids())) with check (org_id = any(ss_current_user_org_ids()))',
      t || '_tenant_isolation', t
    );
  end loop;
end $$;

alter table saas_platform_admins enable row level security;
alter table saas_platform_admins force row level security;
drop policy if exists saas_platform_admins_self on saas_platform_admins;
create policy saas_platform_admins_self on saas_platform_admins
  using (user_id = ss_current_user_id())
  with check (false);

-- The product catalog is global only to the organization; plan definitions are
-- intentionally platform-wide and are read through server-side APIs.

create or replace function ss_assign_default_branch() returns trigger
language plpgsql
as $$
begin
  if new.branch_id is null then
    select b.id into new.branch_id
    from branches b
    where b.org_id = new.org_id and b.is_default and b.active
    order by b.created_at
    limit 1;
  end if;
  if new.branch_id is null then
    raise exception 'SS:DEFAULT_BRANCH_MISSING';
  end if;
  return new;
end;
$$;
drop trigger if exists warehouses_default_branch_trg on warehouses;
create trigger warehouses_default_branch_trg
before insert or update of org_id, branch_id on warehouses
for each row execute function ss_assign_default_branch();

-- Extend tenant-aware references to inventory balances and ledger records.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'document_lines_location_tenant_fk') then
    alter table document_lines add constraint document_lines_location_tenant_fk
      foreign key (org_id, location_id) references locations (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_reverses_tenant_fk') then
    alter table documents add constraint documents_reverses_tenant_fk
      foreign key (org_id, reverses_id) references documents (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_reversed_by_tenant_fk') then
    alter table documents add constraint documents_reversed_by_tenant_fk
      foreign key (org_id, reversed_by) references documents (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_sales_order_tenant_fk') then
    alter table documents add constraint documents_sales_order_tenant_fk
      foreign key (org_id, sales_order_id) references sales_orders (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_purchase_order_tenant_fk') then
    alter table documents add constraint documents_purchase_order_tenant_fk
      foreign key (org_id, purchase_order_id) references purchase_orders (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ledger_document_tenant_fk') then
    alter table ledger add constraint ledger_document_tenant_fk
      foreign key (org_id, document_id) references documents (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ledger_line_tenant_fk') then
    alter table ledger add constraint ledger_line_tenant_fk
      foreign key (org_id, line_id) references document_lines (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ledger_product_tenant_fk') then
    alter table ledger add constraint ledger_product_tenant_fk
      foreign key (org_id, product_id) references products (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ledger_warehouse_tenant_fk') then
    alter table ledger add constraint ledger_warehouse_tenant_fk
      foreign key (org_id, warehouse_id) references warehouses (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_balance_product_tenant_fk') then
    alter table stock_balance add constraint stock_balance_product_tenant_fk
      foreign key (org_id, product_id) references products (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_balance_warehouse_tenant_fk') then
    alter table stock_balance add constraint stock_balance_warehouse_tenant_fk
      foreign key (org_id, warehouse_id) references warehouses (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_batch_product_tenant_fk') then
    alter table stock_batch add constraint stock_batch_product_tenant_fk
      foreign key (org_id, product_id) references products (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_batch_warehouse_tenant_fk') then
    alter table stock_batch add constraint stock_batch_warehouse_tenant_fk
      foreign key (org_id, warehouse_id) references warehouses (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_serial_product_tenant_fk') then
    alter table stock_serial add constraint stock_serial_product_tenant_fk
      foreign key (org_id, product_id) references products (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_serial_warehouse_tenant_fk') then
    alter table stock_serial add constraint stock_serial_warehouse_tenant_fk
      foreign key (org_id, warehouse_id) references warehouses (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_serial_document_tenant_fk') then
    alter table stock_serial add constraint stock_serial_document_tenant_fk
      foreign key (org_id, document_id) references documents (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_orders_reservation_document_tenant_fk') then
    alter table sales_orders add constraint sales_orders_reservation_document_tenant_fk
      foreign key (org_id, reservation_document_id) references documents (org_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stocktakes_adjustment_document_tenant_fk') then
    alter table stocktakes add constraint stocktakes_adjustment_document_tenant_fk
      foreign key (org_id, adjustment_document_id) references documents (org_id, id) not valid;
  end if;
end $$;

-- Country/currency-specific price points keep one commercial plan usable across
-- Egypt and Arab markets without duplicating plan feature definitions.
create index if not exists saas_plans_public_idx
  on saas_plans (is_public, is_active, sort_order);

create table if not exists saas_plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references saas_plans(id) on delete cascade,
  country_code text not null,
  currency text not null,
  monthly_price_minor bigint not null check (monthly_price_minor >= 0),
  annual_price_minor bigint not null check (annual_price_minor >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, country_code, currency)
);
create index if not exists saas_plan_prices_market_idx
  on saas_plan_prices (country_code, currency, active);
