-- Smart Stock AI schema. Quantities and money are numeric. Ledger is append-only.

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text not null default 'general',
  currency text not null default 'EGP',
  timezone text not null default 'Africa/Cairo',
  locale text not null default 'ar',
  tax_rate numeric(8,4) not null default 0,
  allow_negative boolean not null default false,
  expiry_warn_days int not null default 30,
  slow_days int not null default 90,
  demo_seeded boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id text not null,
  role text not null,
  grants jsonb not null default '[]'::jsonb,
  revokes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  parent_id uuid references categories(id) on delete set null,
  name_ar text not null,
  name_en text not null default '',
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists categories_org_idx on categories (org_id);

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name_ar text not null,
  name_en text not null,
  dimension text not null default 'count',
  unique (org_id, code)
);

create table if not exists warehouses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name_ar text not null,
  name_en text not null default '',
  kind text not null default 'standard',
  address text not null default '',
  city text not null default '',
  phone text not null default '',
  manager_name text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  parent_id uuid references locations(id) on delete set null,
  code text not null,
  name text not null,
  unique (warehouse_id, code)
);

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name_ar text not null,
  name_en text not null default '',
  company text not null default '',
  contact text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  country text not null default '',
  city text not null default '',
  tax_id text not null default '',
  payment_terms text not null default '',
  currency text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  kind text not null default 'customer',
  name_ar text not null,
  name_en text not null default '',
  contact text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  parent_id uuid references products(id) on delete set null,
  sku text not null,
  barcode text not null default '',
  name_ar text not null,
  name_en text not null default '',
  description text not null default '',
  image text not null default '',
  category_id uuid references categories(id) on delete set null,
  brand text not null default '',
  manufacturer text not null default '',
  product_type text not null default 'standard',
  base_unit_id uuid references units(id),
  avg_cost numeric(18,4) not null default 0,
  price numeric(18,4) not null default 0,
  reorder_point numeric(18,4) not null default 0,
  min_qty numeric(18,4) not null default 0,
  max_qty numeric(18,4),
  supplier_id uuid references suppliers(id) on delete set null,
  track_batch boolean not null default false,
  track_expiry boolean not null default false,
  track_serial boolean not null default false,
  status text not null default 'active',
  custom jsonb not null default '{}'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, sku)
);
create index if not exists products_org_idx on products (org_id);
create index if not exists products_barcode_idx on products (org_id, barcode);

create table if not exists product_units (
  product_id uuid not null references products(id) on delete cascade,
  unit_id uuid not null references units(id) on delete cascade,
  factor numeric(18,6) not null check (factor > 0),
  primary key (product_id, unit_id)
);

create table if not exists doc_counters (
  org_id uuid not null references organizations(id) on delete cascade,
  doc_type text not null,
  n int not null default 0,
  primary key (org_id, doc_type)
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  doc_type text not null,
  doc_no text not null,
  status text not null default 'draft',
  warehouse_id uuid references warehouses(id),
  warehouse_to_id uuid references warehouses(id),
  partner_type text,
  partner_id uuid,
  reference text not null default '',
  reason text not null default '',
  notes text not null default '',
  idempotency_key text,
  sales_order_id uuid,
  purchase_order_id uuid,
  reverses_id uuid,
  reversed_by uuid,
  created_by text not null,
  posted_by text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, doc_no)
);
create unique index if not exists documents_idem_idx
  on documents (org_id, idempotency_key) where idempotency_key is not null;
create index if not exists documents_org_idx on documents (org_id, created_at desc);

create table if not exists document_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  org_id uuid not null,
  product_id uuid not null references products(id),
  direction text not null check (direction in ('in', 'out')),
  qty numeric(18,4) not null check (qty > 0),
  unit_id uuid,
  factor numeric(18,6) not null default 1,
  qty_base numeric(18,4) not null check (qty_base > 0),
  unit_cost numeric(18,4),
  batch_no text,
  expiry_date date,
  serial_no text,
  location_id uuid,
  line_no int not null default 1
);

create table if not exists ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  document_id uuid not null,
  line_id uuid,
  product_id uuid not null,
  warehouse_id uuid not null,
  direction text not null,
  qty_base numeric(18,4) not null,
  unit_cost numeric(18,4) not null default 0,
  doc_type text not null,
  batch_no text,
  expiry_date date,
  serial_no text,
  posted_by text not null,
  posted_at timestamptz not null default now()
);
create index if not exists ledger_org_time_idx on ledger (org_id, posted_at desc);
create index if not exists ledger_product_idx on ledger (org_id, product_id);

create table if not exists stock_balance (
  org_id uuid not null,
  product_id uuid not null,
  warehouse_id uuid not null,
  on_hand numeric(18,4) not null default 0,
  reserved numeric(18,4) not null default 0,
  primary key (org_id, product_id, warehouse_id)
);

create table if not exists stock_batch (
  org_id uuid not null,
  product_id uuid not null,
  warehouse_id uuid not null,
  batch_no text not null,
  expiry_date date,
  qty numeric(18,4) not null default 0,
  primary key (org_id, product_id, warehouse_id, batch_no)
);

create table if not exists stock_serial (
  org_id uuid not null,
  serial_no text not null,
  product_id uuid not null,
  warehouse_id uuid,
  status text not null,
  document_id uuid,
  updated_at timestamptz not null default now(),
  primary key (org_id, serial_no)
);

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  doc_no text not null,
  supplier_id uuid not null references suppliers(id),
  warehouse_id uuid not null references warehouses(id),
  status text not null default 'draft',
  order_date date not null default current_date,
  expected_date date,
  notes text not null default '',
  currency text not null default '',
  shipping numeric(18,4) not null default 0,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (org_id, doc_no)
);

create table if not exists purchase_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references purchase_orders(id) on delete cascade,
  org_id uuid not null,
  product_id uuid not null references products(id),
  qty numeric(18,4) not null check (qty > 0),
  qty_received numeric(18,4) not null default 0,
  unit_id uuid,
  factor numeric(18,6) not null default 1,
  unit_price numeric(18,4) not null default 0,
  tax_rate numeric(8,4) not null default 0,
  line_no int not null default 1
);

create table if not exists sales_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  doc_no text not null,
  customer_id uuid references customers(id),
  warehouse_id uuid not null references warehouses(id),
  status text not null default 'draft',
  notes text not null default '',
  reservation_document_id uuid,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (org_id, doc_no)
);

create table if not exists sales_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references sales_orders(id) on delete cascade,
  org_id uuid not null,
  product_id uuid not null references products(id),
  qty numeric(18,4) not null check (qty > 0),
  qty_dispatched numeric(18,4) not null default 0,
  unit_id uuid,
  factor numeric(18,6) not null default 1,
  qty_base numeric(18,4) not null,
  unit_price numeric(18,4) not null default 0,
  tax_rate numeric(8,4) not null default 0,
  line_no int not null default 1
);

create table if not exists stocktakes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  warehouse_id uuid not null references warehouses(id),
  doc_no text not null,
  status text not null default 'draft',
  notes text not null default '',
  adjustment_document_id uuid,
  created_by text not null,
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  unique (org_id, doc_no)
);

create table if not exists stocktake_lines (
  id uuid primary key default gen_random_uuid(),
  stocktake_id uuid not null references stocktakes(id) on delete cascade,
  org_id uuid not null,
  product_id uuid not null references products(id),
  system_qty numeric(18,4) not null,
  counted_qty numeric(18,4),
  reason text not null default ''
);

create table if not exists boms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  product_id uuid not null references products(id),
  kind text not null default 'manufacturing',
  name text not null,
  yield_qty numeric(18,4) not null default 1 check (yield_qty > 0),
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists bom_lines (
  id uuid primary key default gen_random_uuid(),
  bom_id uuid not null references boms(id) on delete cascade,
  org_id uuid not null,
  product_id uuid not null references products(id),
  qty numeric(18,4) not null check (qty > 0),
  line_no int not null default 1
);

create table if not exists custom_fields (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  entity text not null default 'product',
  key text not null,
  label_ar text not null,
  label_en text not null default '',
  field_type text not null,
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  sort int not null default 0,
  unique (org_id, entity, key)
);

create table if not exists alert_states (
  org_id uuid not null references organizations(id) on delete cascade,
  alert_key text not null,
  status text not null default 'open',
  assignee text,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (org_id, alert_key)
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id text not null,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_org_idx on audit_log (org_id, created_at desc);

create table if not exists ai_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id text not null,
  kind text not null,
  excerpt text not null default '',
  created_at timestamptz not null default now()
);

create or replace function ss_member(p_org uuid, p_user text) returns void
language plpgsql as $$
begin
  if p_user is null or length(p_user) = 0 then raise exception 'SS:FORBIDDEN'; end if;
  if not exists (select 1 from memberships where org_id = p_org and user_id = p_user) then
    raise exception 'SS:FORBIDDEN';
  end if;
end;
$$;

create or replace function ss_next_no(p_org uuid, p_type text) returns text
language plpgsql as $$
declare n int; prefix text;
begin
  insert into doc_counters (org_id, doc_type, n) values (p_org, p_type, 1)
  on conflict (org_id, doc_type) do update set n = doc_counters.n + 1
  returning doc_counters.n into n;
  prefix := case p_type
    when 'receipt' then 'RCP' when 'issue' then 'ISS' when 'transfer' then 'TRF'
    when 'adjustment' then 'ADJ' when 'opening' then 'OPN' when 'damage' then 'DMG'
    when 'return_in' then 'SRT' when 'return_out' then 'PRT' when 'consumption' then 'CON'
    when 'reservation' then 'RSV' when 'reservation_release' then 'RSR' when 'dispatch' then 'DSP'
    when 'production' then 'PRD' when 'reversal' then 'REV' when 'purchase' then 'PO'
    when 'sales' then 'SO' when 'stocktake' then 'CNT' else 'DOC' end;
  return prefix || '-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 4, '0');
end;
$$;

create or replace function ss_audit(p_org uuid, p_user text, p_action text, p_entity text, p_id text, p_detail jsonb) returns void
language plpgsql as $$
begin
  insert into audit_log (org_id, user_id, action, entity, entity_id, detail)
  values (p_org, p_user, p_action, p_entity, p_id, coalesce(p_detail, '{}'::jsonb));
end;
$$;

create or replace function ss_block_ledger() returns trigger language plpgsql as $$
begin raise exception 'SS:IMMUTABLE'; end; $$;

drop trigger if exists ledger_immutable on ledger;
create trigger ledger_immutable before update or delete on ledger
for each row execute function ss_block_ledger();

create or replace function ss_block_posted_lines() returns trigger language plpgsql as $$
declare st text; doc uuid;
begin
  doc := coalesce(old.document_id, new.document_id);
  select status into st from documents where id = doc;
  if st = 'posted' or st = 'reversed' then raise exception 'SS:IMMUTABLE'; end if;
  return coalesce(new, old);
end; $$;

drop trigger if exists lines_immutable on document_lines;
create trigger lines_immutable before update or delete on document_lines
for each row execute function ss_block_posted_lines();

create or replace function ss_apply_chunk(
  p_org uuid, p_doc uuid, p_line uuid, p_user text, p_doc_type text, p_product uuid, p_wh uuid,
  p_dir text, p_qty numeric, p_cost numeric, p_batch text, p_expiry date, p_serial text,
  p_allow_neg boolean, p_touch_reserved text
) returns void language plpgsql as $$
declare v_oh numeric; v_rs numeric; v_batch_qty numeric;
begin
  if p_qty <= 0 then return; end if;
  insert into stock_balance (org_id, product_id, warehouse_id, on_hand, reserved)
  values (p_org, p_product, p_wh, 0, 0) on conflict do nothing;
  select on_hand, reserved into v_oh, v_rs from stock_balance
  where org_id = p_org and product_id = p_product and warehouse_id = p_wh for update;

  if p_touch_reserved = 'reserve' then
    if (v_oh - v_rs) < p_qty then raise exception 'SS:INSUFFICIENT'; end if;
    update stock_balance set reserved = reserved + p_qty
    where org_id = p_org and product_id = p_product and warehouse_id = p_wh;
  elsif p_touch_reserved = 'release' then
    if v_rs < p_qty then raise exception 'SS:NEGATIVE_RESERVED'; end if;
    update stock_balance set reserved = reserved - p_qty
    where org_id = p_org and product_id = p_product and warehouse_id = p_wh;
  elsif p_dir = 'out' then
    if p_touch_reserved = 'dispatch' then
      if v_rs < p_qty then raise exception 'SS:NEGATIVE_RESERVED'; end if;
      if (not p_allow_neg) and v_oh < p_qty then raise exception 'SS:INSUFFICIENT'; end if;
      update stock_balance set on_hand = on_hand - p_qty, reserved = reserved - p_qty
      where org_id = p_org and product_id = p_product and warehouse_id = p_wh;
    else
      if (not p_allow_neg) and (v_oh - v_rs) < p_qty then raise exception 'SS:INSUFFICIENT'; end if;
      update stock_balance set on_hand = on_hand - p_qty
      where org_id = p_org and product_id = p_product and warehouse_id = p_wh;
    end if;
  else
    update stock_balance set on_hand = on_hand + p_qty
    where org_id = p_org and product_id = p_product and warehouse_id = p_wh;
  end if;

  if p_batch is not null and length(p_batch) > 0 and p_touch_reserved is null then
    insert into stock_batch (org_id, product_id, warehouse_id, batch_no, expiry_date, qty)
    values (p_org, p_product, p_wh, p_batch, p_expiry, 0)
    on conflict (org_id, product_id, warehouse_id, batch_no)
    do update set expiry_date = coalesce(stock_batch.expiry_date, excluded.expiry_date);
    select qty into v_batch_qty from stock_batch
    where org_id = p_org and product_id = p_product and warehouse_id = p_wh and batch_no = p_batch
    for update;
    if p_dir = 'out' then
      if v_batch_qty < p_qty then raise exception 'SS:BATCH'; end if;
      update stock_batch set qty = qty - p_qty
      where org_id = p_org and product_id = p_product and warehouse_id = p_wh and batch_no = p_batch;
    else
      update stock_batch set qty = qty + p_qty
      where org_id = p_org and product_id = p_product and warehouse_id = p_wh and batch_no = p_batch;
    end if;
  end if;

  if p_serial is not null and length(p_serial) > 0 and p_touch_reserved is null then
    if p_dir = 'in' then
      insert into stock_serial (org_id, serial_no, product_id, warehouse_id, status, document_id)
      values (p_org, p_serial, p_product, p_wh, 'in_stock', p_doc)
      on conflict (org_id, serial_no) do update
        set product_id = excluded.product_id, warehouse_id = excluded.warehouse_id,
            status = 'in_stock', document_id = excluded.document_id, updated_at = now()
        where stock_serial.status <> 'in_stock';
      if not found then raise exception 'SS:SERIAL'; end if;
    else
      update stock_serial set status = 'issued', warehouse_id = p_wh, document_id = p_doc, updated_at = now()
      where org_id = p_org and serial_no = p_serial and status = 'in_stock' and product_id = p_product;
      if not found then raise exception 'SS:SERIAL'; end if;
    end if;
  end if;

  insert into ledger (
    org_id, document_id, line_id, product_id, warehouse_id, direction,
    qty_base, unit_cost, doc_type, batch_no, expiry_date, serial_no, posted_by
  ) values (
    p_org, p_doc, p_line, p_product, p_wh,
    case when p_touch_reserved is null then p_dir else p_touch_reserved end,
    p_qty, coalesce(p_cost, 0), p_doc_type, nullif(p_batch, ''), p_expiry, nullif(p_serial, ''), p_user
  );
end;
$$;

create or replace function ss_post_document(p_org uuid, p_doc uuid, p_user text) returns void
language plpgsql as $$
declare
  d documents%rowtype; ln record; v_allow boolean; v_type text; v_track_exp boolean;
  v_track_batch boolean; v_avg numeric; v_old numeric; v_cost numeric; v_wh uuid;
  v_dir text; v_touch text; v_left numeric; v_take numeric; b record;
begin
  perform ss_member(p_org, p_user);
  select * into d from documents where id = p_doc and org_id = p_org for update;
  if not found then raise exception 'SS:NOT_FOUND'; end if;
  if d.status not in ('draft', 'pending') then raise exception 'SS:NOT_DRAFT'; end if;
  if not exists (select 1 from document_lines where document_id = p_doc) then raise exception 'SS:EMPTY'; end if;
  if d.doc_type = 'transfer' then
    if d.warehouse_id is null or d.warehouse_to_id is null then raise exception 'SS:WAREHOUSE'; end if;
    if d.warehouse_id = d.warehouse_to_id then raise exception 'SS:SAME_WAREHOUSE'; end if;
  elsif d.doc_type <> 'adjustment' and d.warehouse_id is null then
    raise exception 'SS:WAREHOUSE';
  end if;
  select allow_negative into v_allow from organizations where id = p_org;

  for ln in select * from document_lines where document_id = p_doc order by line_no, id loop
    select product_type, track_expiry, track_batch, avg_cost
      into v_type, v_track_exp, v_track_batch, v_avg
    from products where id = ln.product_id and org_id = p_org for update;
    if not found then raise exception 'SS:NOT_FOUND'; end if;
    if v_type = 'service' then raise exception 'SS:SERVICE'; end if;
    v_cost := coalesce(ln.unit_cost, v_avg);
    v_dir := ln.direction;
    v_touch := null;
    v_wh := d.warehouse_id;
    if d.doc_type = 'reservation' then v_touch := 'reserve';
    elsif d.doc_type = 'reservation_release' then v_touch := 'release';
    elsif d.doc_type = 'dispatch' then v_touch := 'dispatch'; v_dir := 'out';
    elsif d.doc_type = 'transfer' then v_dir := 'out';
    end if;

    if v_touch is null and v_dir = 'in' and ln.unit_cost is not null then
      select coalesce(sum(on_hand), 0) into v_old from stock_balance
      where org_id = p_org and product_id = ln.product_id;
      if v_old + ln.qty_base = 0 then v_avg := round((ln.unit_cost * ln.qty) / ln.qty_base, 4);
      else v_avg := round((v_old * v_avg + ln.unit_cost * ln.qty) / (v_old + ln.qty_base), 4);
      end if;
      update products set avg_cost = v_avg, updated_at = now() where id = ln.product_id;
      v_cost := round((ln.unit_cost * ln.qty) / ln.qty_base, 4);
    elsif v_touch is null and v_dir = 'out' then
      v_cost := v_avg;
    end if;

    if d.doc_type = 'transfer' and v_track_exp and (ln.batch_no is null or length(ln.batch_no) = 0) then
      raise exception 'SS:BATCH_REQUIRED';
    end if;

    if v_touch is null and v_dir = 'out' and v_track_exp and (ln.batch_no is null or ln.batch_no = '') then
      v_left := ln.qty_base;
      for b in
        select batch_no, expiry_date, qty from stock_batch
        where org_id = p_org and product_id = ln.product_id and warehouse_id = v_wh and qty > 0
        order by expiry_date nulls last, batch_no
      loop
        exit when v_left <= 0;
        v_take := least(b.qty, v_left);
        perform ss_apply_chunk(p_org, p_doc, ln.id, p_user, d.doc_type, ln.product_id, v_wh,
          'out', v_take, v_cost, b.batch_no, b.expiry_date, ln.serial_no, v_allow, null);
        v_left := v_left - v_take;
      end loop;
      if v_left > 0 then raise exception 'SS:INSUFFICIENT'; end if;
    else
      if v_dir = 'in' and v_track_batch and (ln.batch_no is null or ln.batch_no = '') and v_touch is null then
        raise exception 'SS:BATCH_REQUIRED';
      end if;
      perform ss_apply_chunk(p_org, p_doc, ln.id, p_user, d.doc_type, ln.product_id, v_wh,
        v_dir, ln.qty_base, v_cost, ln.batch_no, ln.expiry_date, ln.serial_no, v_allow, v_touch);
    end if;

    if d.doc_type = 'transfer' then
      perform ss_apply_chunk(p_org, p_doc, ln.id, p_user, d.doc_type, ln.product_id, d.warehouse_to_id,
        'in', ln.qty_base, v_cost, ln.batch_no, ln.expiry_date, ln.serial_no, v_allow, null);
    end if;
  end loop;

  update documents set status = 'posted', posted_by = p_user, posted_at = now() where id = p_doc;
  perform ss_audit(p_org, p_user, 'post', 'document', p_doc::text,
    jsonb_build_object('doc_no', d.doc_no, 'doc_type', d.doc_type));
end;
$$;

create or replace function ss_save_document(p_org uuid, p_user text, p_payload jsonb) returns uuid
language plpgsql as $$
declare
  v_id uuid; v_existing uuid; v_type text; v_key text; v_no text; v_status text;
  ln jsonb; i int := 0; v_product uuid; v_qty numeric; v_factor numeric; v_base numeric;
  v_unit uuid; v_base_unit uuid; v_dir text; v_ptype text;
begin
  perform ss_member(p_org, p_user);
  v_type := p_payload->>'docType';
  v_key := nullif(p_payload->>'idempotencyKey', '');
  if v_type is null then raise exception 'SS:VALIDATION'; end if;
  if v_key is not null then
    select id into v_existing from documents where org_id = p_org and idempotency_key = v_key;
    if found then return v_existing; end if;
  end if;
  v_id := nullif(p_payload->>'id', '')::uuid;
  if v_id is not null then
    select status into v_status from documents where id = v_id and org_id = p_org for update;
    if not found then raise exception 'SS:NOT_FOUND'; end if;
    if v_status <> 'draft' then raise exception 'SS:NOT_DRAFT'; end if;
    update documents set
      doc_type = v_type,
      warehouse_id = nullif(p_payload->>'warehouseId', '')::uuid,
      warehouse_to_id = nullif(p_payload->>'warehouseToId', '')::uuid,
      partner_type = nullif(p_payload->>'partnerType', ''),
      partner_id = nullif(p_payload->>'partnerId', '')::uuid,
      reference = coalesce(p_payload->>'reference', ''),
      reason = coalesce(p_payload->>'reason', ''),
      notes = coalesce(p_payload->>'notes', ''),
      sales_order_id = nullif(p_payload->>'salesOrderId', '')::uuid,
      purchase_order_id = nullif(p_payload->>'purchaseOrderId', '')::uuid
    where id = v_id;
    delete from document_lines where document_id = v_id;
  else
    v_no := ss_next_no(p_org, v_type);
    insert into documents (
      org_id, doc_type, doc_no, status, warehouse_id, warehouse_to_id, partner_type, partner_id,
      reference, reason, notes, idempotency_key, sales_order_id, purchase_order_id, created_by
    ) values (
      p_org, v_type, v_no, 'draft',
      nullif(p_payload->>'warehouseId', '')::uuid,
      nullif(p_payload->>'warehouseToId', '')::uuid,
      nullif(p_payload->>'partnerType', ''),
      nullif(p_payload->>'partnerId', '')::uuid,
      coalesce(p_payload->>'reference', ''), coalesce(p_payload->>'reason', ''), coalesce(p_payload->>'notes', ''),
      v_key, nullif(p_payload->>'salesOrderId', '')::uuid, nullif(p_payload->>'purchaseOrderId', '')::uuid, p_user
    ) returning id into v_id;
  end if;
  if p_payload->'lines' is null or jsonb_typeof(p_payload->'lines') <> 'array' or jsonb_array_length(p_payload->'lines') = 0 then
    raise exception 'SS:EMPTY';
  end if;
  for ln in select * from jsonb_array_elements(p_payload->'lines') loop
    i := i + 1;
    v_product := (ln->>'productId')::uuid;
    v_qty := (ln->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'SS:VALIDATION'; end if;
    select product_type, base_unit_id into v_ptype, v_base_unit from products where id = v_product and org_id = p_org;
    if not found then raise exception 'SS:NOT_FOUND'; end if;
    if v_ptype = 'service' then raise exception 'SS:SERVICE'; end if;
    v_unit := nullif(ln->>'unitId', '')::uuid;
    if v_unit is null or v_unit = v_base_unit then v_factor := 1; v_unit := v_base_unit;
    else
      select factor into v_factor from product_units where product_id = v_product and unit_id = v_unit;
      if not found then raise exception 'SS:UNIT'; end if;
    end if;
    v_base := round(v_qty * v_factor, 4);
    v_dir := ln->>'direction';
    if v_type in ('receipt','opening','return_in') then v_dir := 'in';
    elsif v_type in ('issue','damage','return_out','consumption','dispatch','reservation','reservation_release','transfer') then v_dir := 'out';
    elsif v_dir is null or v_dir not in ('in','out') then raise exception 'SS:VALIDATION';
    end if;
    insert into document_lines (
      document_id, org_id, product_id, direction, qty, unit_id, factor, qty_base,
      unit_cost, batch_no, expiry_date, serial_no, location_id, line_no
    ) values (
      v_id, p_org, v_product, v_dir, v_qty, v_unit, v_factor, v_base,
      nullif(ln->>'unitCost', '')::numeric, nullif(ln->>'batchNo', ''),
      nullif(ln->>'expiry', '')::date, nullif(ln->>'serialNo', ''),
      nullif(ln->>'locationId', '')::uuid, i
    );
  end loop;
  perform ss_audit(p_org, p_user, 'save', 'document', v_id::text, jsonb_build_object('doc_type', v_type));
  return v_id;
end;
$$;

create or replace function ss_reverse_document(p_org uuid, p_doc uuid, p_user text, p_reason text) returns uuid
language plpgsql as $$
declare d documents%rowtype; v_id uuid; v_type text; v_wh uuid; v_wh2 uuid;
begin
  perform ss_member(p_org, p_user);
  select * into d from documents where id = p_doc and org_id = p_org for update;
  if not found then raise exception 'SS:NOT_FOUND'; end if;
  if d.status <> 'posted' then raise exception 'SS:NOT_POSTED'; end if;
  if d.reversed_by is not null then raise exception 'SS:ALREADY_REVERSED'; end if;
  if d.doc_type = 'transfer' then
    v_type := 'transfer'; v_wh := d.warehouse_to_id; v_wh2 := d.warehouse_id;
  elsif d.doc_type = 'reservation' then
    v_type := 'reservation_release'; v_wh := d.warehouse_id; v_wh2 := null;
  elsif d.doc_type = 'reservation_release' then
    v_type := 'reservation'; v_wh := d.warehouse_id; v_wh2 := null;
  else
    v_type := 'reversal'; v_wh := d.warehouse_id; v_wh2 := d.warehouse_to_id;
  end if;
  insert into documents (
    org_id, doc_type, doc_no, status, warehouse_id, warehouse_to_id, partner_type, partner_id,
    reference, reason, notes, reverses_id, sales_order_id, purchase_order_id, created_by
  ) values (
    p_org, v_type, ss_next_no(p_org, v_type), 'draft', v_wh, v_wh2, d.partner_type, d.partner_id,
    d.doc_no, coalesce(p_reason, ''), 'reversal of ' || d.doc_no, d.id, d.sales_order_id, d.purchase_order_id, p_user
  ) returning id into v_id;
  if v_type = 'transfer' or v_type in ('reservation', 'reservation_release') then
    insert into document_lines (document_id, org_id, product_id, direction, qty, unit_id, factor, qty_base, unit_cost, batch_no, expiry_date, serial_no, location_id, line_no)
    select v_id, org_id, product_id, direction, qty, unit_id, factor, qty_base, unit_cost, batch_no, expiry_date, serial_no, location_id, line_no
    from document_lines where document_id = p_doc;
  else
    insert into document_lines (document_id, org_id, product_id, direction, qty, unit_id, factor, qty_base, unit_cost, batch_no, expiry_date, serial_no, location_id, line_no)
    select v_id, org_id, product_id, case when direction = 'in' then 'out' else 'in' end, qty, unit_id, factor, qty_base, unit_cost, batch_no, expiry_date, serial_no, location_id, line_no
    from document_lines where document_id = p_doc;
  end if;
  perform ss_post_document(p_org, v_id, p_user);
  update documents set reversed_by = v_id, status = 'reversed' where id = p_doc;
  if d.doc_type = 'dispatch' and d.sales_order_id is not null then
    update sales_lines sl set qty_dispatched = greatest(0, sl.qty_dispatched - src.qty)
    from document_lines src
    where src.document_id = p_doc and sl.order_id = d.sales_order_id and sl.product_id = src.product_id;
    update sales_orders set status = 'confirmed' where id = d.sales_order_id and status = 'fulfilled';
  end if;
  perform ss_audit(p_org, p_user, 'reverse', 'document', p_doc::text, jsonb_build_object('reversal', v_id, 'reason', coalesce(p_reason, '')));
  return v_id;
end;
$$;

create or replace function ss_receive_po(p_org uuid, p_po uuid, p_user text, p_lines jsonb, p_key text) returns uuid
language plpgsql as $$
declare
  po purchase_orders%rowtype; item jsonb; pl purchase_lines%rowtype; v_qty numeric;
  v_doc uuid; v_lines jsonb := '[]'::jsonb; v_all boolean := true; v_any boolean := false;
begin
  perform ss_member(p_org, p_user);
  if p_key is not null then
    select id into v_doc from documents where org_id = p_org and idempotency_key = p_key;
    if found then return v_doc; end if;
  end if;
  select * into po from purchase_orders where id = p_po and org_id = p_org for update;
  if not found then raise exception 'SS:NOT_FOUND'; end if;
  if po.status not in ('approved', 'partial') then raise exception 'SS:NOT_APPROVED'; end if;
  for item in select * from jsonb_array_elements(p_lines) loop
    v_qty := (item->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;
    select * into pl from purchase_lines where id = (item->>'lineId')::uuid and order_id = p_po for update;
    if not found then raise exception 'SS:NOT_FOUND'; end if;
    if pl.qty_received + v_qty > pl.qty then raise exception 'SS:OVER_RECEIVE'; end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'productId', pl.product_id, 'qty', v_qty, 'unitId', pl.unit_id, 'unitCost', pl.unit_price,
      'batchNo', coalesce(item->>'batchNo', ''), 'expiry', coalesce(item->>'expiry', ''),
      'serialNo', coalesce(item->>'serialNo', '')
    ));
  end loop;
  if jsonb_array_length(v_lines) = 0 then raise exception 'SS:EMPTY'; end if;
  v_doc := ss_save_document(p_org, p_user, jsonb_build_object(
    'docType', 'receipt', 'idempotencyKey', p_key, 'warehouseId', po.warehouse_id,
    'partnerType', 'supplier', 'partnerId', po.supplier_id, 'reference', po.doc_no,
    'purchaseOrderId', po.id, 'notes', 'receipt for ' || po.doc_no, 'lines', v_lines
  ));
  perform ss_post_document(p_org, v_doc, p_user);
  for item in select * from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((item->>'qty')::numeric, 0);
    if v_qty > 0 then
      update purchase_lines set qty_received = qty_received + v_qty where id = (item->>'lineId')::uuid;
    end if;
  end loop;
  select bool_and(qty_received >= qty), bool_or(qty_received > 0) into v_all, v_any
  from purchase_lines where order_id = p_po;
  update purchase_orders set status = case when v_all then 'received' when v_any then 'partial' else status end where id = p_po;
  perform ss_audit(p_org, p_user, 'receive', 'purchase_order', p_po::text, jsonb_build_object('document', v_doc));
  return v_doc;
end;
$$;

create or replace function ss_confirm_sales(p_org uuid, p_so uuid, p_user text) returns uuid
language plpgsql as $$
declare so sales_orders%rowtype; v_lines jsonb := '[]'::jsonb; ln record; v_doc uuid;
begin
  perform ss_member(p_org, p_user);
  select * into so from sales_orders where id = p_so and org_id = p_org for update;
  if not found then raise exception 'SS:NOT_FOUND'; end if;
  if so.status <> 'draft' then raise exception 'SS:NOT_DRAFT'; end if;
  for ln in select * from sales_lines where order_id = p_so order by line_no loop
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('productId', ln.product_id, 'qty', ln.qty, 'unitId', ln.unit_id));
  end loop;
  v_doc := ss_save_document(p_org, p_user, jsonb_build_object(
    'docType', 'reservation', 'warehouseId', so.warehouse_id, 'partnerType', 'customer',
    'partnerId', so.customer_id, 'reference', so.doc_no, 'salesOrderId', so.id, 'lines', v_lines
  ));
  perform ss_post_document(p_org, v_doc, p_user);
  update sales_orders set status = 'confirmed', reservation_document_id = v_doc where id = p_so;
  perform ss_audit(p_org, p_user, 'confirm', 'sales_order', p_so::text, jsonb_build_object('reservation', v_doc));
  return v_doc;
end;
$$;

create or replace function ss_dispatch_sales(p_org uuid, p_so uuid, p_user text, p_lines jsonb, p_key text) returns uuid
language plpgsql as $$
declare
  so sales_orders%rowtype; item jsonb; sl sales_lines%rowtype; v_qty numeric; v_doc uuid;
  v_lines jsonb := '[]'::jsonb; v_all boolean;
begin
  perform ss_member(p_org, p_user);
  if p_key is not null then
    select id into v_doc from documents where org_id = p_org and idempotency_key = p_key;
    if found then return v_doc; end if;
  end if;
  select * into so from sales_orders where id = p_so and org_id = p_org for update;
  if not found then raise exception 'SS:NOT_FOUND'; end if;
  if so.status not in ('confirmed', 'partial') then raise exception 'SS:NOT_CONFIRMED'; end if;
  for item in select * from jsonb_array_elements(p_lines) loop
    v_qty := (item->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;
    select * into sl from sales_lines where id = (item->>'lineId')::uuid and order_id = p_so for update;
    if not found then raise exception 'SS:NOT_FOUND'; end if;
    if sl.qty_dispatched + v_qty > sl.qty then raise exception 'SS:OVER_DISPATCH'; end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('productId', sl.product_id, 'qty', v_qty, 'unitId', sl.unit_id));
  end loop;
  if jsonb_array_length(v_lines) = 0 then raise exception 'SS:EMPTY'; end if;
  v_doc := ss_save_document(p_org, p_user, jsonb_build_object(
    'docType', 'dispatch', 'idempotencyKey', p_key, 'warehouseId', so.warehouse_id,
    'partnerType', 'customer', 'partnerId', so.customer_id, 'reference', so.doc_no,
    'salesOrderId', so.id, 'lines', v_lines
  ));
  perform ss_post_document(p_org, v_doc, p_user);
  for item in select * from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((item->>'qty')::numeric, 0);
    if v_qty > 0 then update sales_lines set qty_dispatched = qty_dispatched + v_qty where id = (item->>'lineId')::uuid; end if;
  end loop;
  select bool_and(qty_dispatched >= qty) into v_all from sales_lines where order_id = p_so;
  update sales_orders set status = case when v_all then 'fulfilled' else 'partial' end where id = p_so;
  perform ss_audit(p_org, p_user, 'dispatch', 'sales_order', p_so::text, jsonb_build_object('document', v_doc));
  return v_doc;
end;
$$;

create or replace function ss_cancel_sales(p_org uuid, p_so uuid, p_user text) returns void
language plpgsql as $$
declare so sales_orders%rowtype; v_rel uuid;
begin
  perform ss_member(p_org, p_user);
  select * into so from sales_orders where id = p_so and org_id = p_org for update;
  if not found then raise exception 'SS:NOT_FOUND'; end if;
  if so.status = 'draft' then
    update sales_orders set status = 'cancelled' where id = p_so; return;
  end if;
  if so.status <> 'confirmed' then raise exception 'SS:NOT_DRAFT'; end if;
  if exists (select 1 from sales_lines where order_id = p_so and qty_dispatched > 0) then
    raise exception 'SS:ALREADY_DISPATCHED';
  end if;
  if so.reservation_document_id is not null then
    v_rel := ss_reverse_document(p_org, so.reservation_document_id, p_user, 'cancel sales');
  end if;
  update sales_orders set status = 'cancelled' where id = p_so;
  perform ss_audit(p_org, p_user, 'cancel', 'sales_order', p_so::text, jsonb_build_object('release', v_rel));
end;
$$;

create or replace function ss_create_stocktake(p_org uuid, p_wh uuid, p_user text, p_notes text) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  perform ss_member(p_org, p_user);
  if not exists (select 1 from warehouses where id = p_wh and org_id = p_org) then raise exception 'SS:NOT_FOUND'; end if;
  insert into stocktakes (org_id, warehouse_id, doc_no, notes, created_by)
  values (p_org, p_wh, ss_next_no(p_org, 'stocktake'), coalesce(p_notes, ''), p_user) returning id into v_id;
  insert into stocktake_lines (stocktake_id, org_id, product_id, system_qty)
  select v_id, p_org, b.product_id, b.on_hand
  from stock_balance b join products p on p.id = b.product_id
  where b.org_id = p_org and b.warehouse_id = p_wh and p.product_type <> 'service' and p.status = 'active';
  perform ss_audit(p_org, p_user, 'create', 'stocktake', v_id::text, '{}'::jsonb);
  return v_id;
end;
$$;

create or replace function ss_post_stocktake(p_org uuid, p_id uuid, p_user text) returns uuid
language plpgsql as $$
declare st stocktakes%rowtype; ln record; v_cur numeric; v_lines jsonb := '[]'::jsonb; v_diff numeric; v_doc uuid;
begin
  perform ss_member(p_org, p_user);
  select * into st from stocktakes where id = p_id and org_id = p_org for update;
  if not found then raise exception 'SS:NOT_FOUND'; end if;
  if st.status <> 'draft' then raise exception 'SS:NOT_DRAFT'; end if;
  for ln in select * from stocktake_lines where stocktake_id = p_id and counted_qty is not null loop
    select coalesce(on_hand, 0) into v_cur from stock_balance
    where org_id = p_org and product_id = ln.product_id and warehouse_id = st.warehouse_id;
    v_cur := coalesce(v_cur, 0);
    v_diff := ln.counted_qty - v_cur;
    if v_diff <> 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'productId', ln.product_id, 'qty', abs(v_diff),
        'direction', case when v_diff > 0 then 'in' else 'out' end
      ));
    end if;
    update stocktake_lines set system_qty = v_cur where id = ln.id;
  end loop;
  if jsonb_array_length(v_lines) > 0 then
    v_doc := ss_save_document(p_org, p_user, jsonb_build_object(
      'docType', 'adjustment', 'warehouseId', st.warehouse_id, 'reference', st.doc_no,
      'reason', 'stocktake', 'notes', st.notes, 'lines', v_lines
    ));
    perform ss_post_document(p_org, v_doc, p_user);
  end if;
  update stocktakes set status = 'posted', posted_at = now(), adjustment_document_id = v_doc where id = p_id;
  perform ss_audit(p_org, p_user, 'post', 'stocktake', p_id::text, jsonb_build_object('document', v_doc));
  return v_doc;
end;
$$;

create or replace function ss_save_purchase(p_org uuid, p_user text, p_payload jsonb) returns uuid
language plpgsql as $$
declare
  v_id uuid;
  v_status text;
  v_no text;
  ln jsonb;
  i int := 0;
  v_product uuid;
  v_qty numeric;
  v_factor numeric;
  v_unit uuid;
  v_base_unit uuid;
begin
  perform ss_member(p_org, p_user);
  if not exists (select 1 from suppliers where id = nullif(p_payload->>'supplierId','')::uuid and org_id = p_org) then
    raise exception 'SS:NOT_FOUND';
  end if;
  if not exists (select 1 from warehouses where id = nullif(p_payload->>'warehouseId','')::uuid and org_id = p_org) then
    raise exception 'SS:NOT_FOUND';
  end if;
  v_id := nullif(p_payload->>'id','')::uuid;
  if v_id is not null then
    select status into v_status from purchase_orders where id = v_id and org_id = p_org for update;
    if not found then raise exception 'SS:NOT_FOUND'; end if;
    if v_status <> 'draft' then raise exception 'SS:NOT_DRAFT'; end if;
    update purchase_orders set
      supplier_id = (p_payload->>'supplierId')::uuid,
      warehouse_id = (p_payload->>'warehouseId')::uuid,
      order_date = coalesce(nullif(p_payload->>'orderDate','')::date, order_date),
      expected_date = nullif(p_payload->>'expectedDate','')::date,
      notes = coalesce(p_payload->>'notes',''),
      currency = coalesce(p_payload->>'currency',''),
      shipping = coalesce(nullif(p_payload->>'shipping','')::numeric, 0)
    where id = v_id;
    delete from purchase_lines where order_id = v_id;
  else
    v_no := ss_next_no(p_org, 'purchase');
    insert into purchase_orders (
      org_id, doc_no, supplier_id, warehouse_id, status, order_date, expected_date, notes, currency, shipping, created_by
    ) values (
      p_org, v_no, (p_payload->>'supplierId')::uuid, (p_payload->>'warehouseId')::uuid, 'draft',
      coalesce(nullif(p_payload->>'orderDate','')::date, current_date),
      nullif(p_payload->>'expectedDate','')::date,
      coalesce(p_payload->>'notes',''), coalesce(p_payload->>'currency',''),
      coalesce(nullif(p_payload->>'shipping','')::numeric, 0), p_user
    ) returning id into v_id;
  end if;
  if jsonb_array_length(coalesce(p_payload->'lines','[]'::jsonb)) = 0 then
    raise exception 'SS:EMPTY';
  end if;
  for ln in select * from jsonb_array_elements(p_payload->'lines') loop
    i := i + 1;
    v_product := (ln->>'productId')::uuid;
    v_qty := (ln->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'SS:VALIDATION'; end if;
    select base_unit_id into v_base_unit from products where id = v_product and org_id = p_org;
    if not found then raise exception 'SS:NOT_FOUND'; end if;
    v_unit := nullif(ln->>'unitId','')::uuid;
    if v_unit is null or v_unit = v_base_unit then
      v_factor := 1; v_unit := v_base_unit;
    else
      select factor into v_factor from product_units where product_id = v_product and unit_id = v_unit;
      if not found then raise exception 'SS:UNIT'; end if;
    end if;
    insert into purchase_lines (order_id, org_id, product_id, qty, unit_id, factor, unit_price, tax_rate, line_no)
    values (
      v_id, p_org, v_product, v_qty, v_unit, v_factor,
      coalesce(nullif(ln->>'unitPrice','')::numeric, 0),
      coalesce(nullif(ln->>'taxRate','')::numeric, 0),
      i
    );
  end loop;
  perform ss_audit(p_org, p_user, 'save', 'purchase_order', v_id::text, '{}'::jsonb);
  return v_id;
end;
$$;

create or replace function ss_set_po_status(p_org uuid, p_po uuid, p_user text, p_status text) returns void
language plpgsql as $$
declare
  v_status text;
  v_recv numeric;
begin
  perform ss_member(p_org, p_user);
  select status into v_status from purchase_orders where id = p_po and org_id = p_org for update;
  if not found then raise exception 'SS:NOT_FOUND'; end if;
  if p_status = 'approved' and v_status = 'draft' then
    update purchase_orders set status = 'approved' where id = p_po;
  elsif p_status = 'cancelled' and v_status in ('draft', 'approved') then
    select coalesce(sum(qty_received),0) into v_recv from purchase_lines where order_id = p_po;
    if v_recv > 0 then raise exception 'SS:ALREADY_RECEIVED'; end if;
    update purchase_orders set status = 'cancelled' where id = p_po;
  else
    raise exception 'SS:VALIDATION';
  end if;
  perform ss_audit(p_org, p_user, p_status, 'purchase_order', p_po::text, '{}'::jsonb);
end;
$$;

create or replace function ss_save_sales(p_org uuid, p_user text, p_payload jsonb) returns uuid
language plpgsql as $$
declare
  v_id uuid;
  v_status text;
  ln jsonb;
  i int := 0;
  v_product uuid;
  v_qty numeric;
  v_factor numeric;
  v_unit uuid;
  v_base_unit uuid;
  v_base numeric;
begin
  perform ss_member(p_org, p_user);
  if not exists (select 1 from warehouses where id = nullif(p_payload->>'warehouseId','')::uuid and org_id = p_org) then
    raise exception 'SS:NOT_FOUND';
  end if;
  v_id := nullif(p_payload->>'id','')::uuid;
  if v_id is not null then
    select status into v_status from sales_orders where id = v_id and org_id = p_org for update;
    if not found then raise exception 'SS:NOT_FOUND'; end if;
    if v_status <> 'draft' then raise exception 'SS:NOT_DRAFT'; end if;
    update sales_orders set
      customer_id = nullif(p_payload->>'customerId','')::uuid,
      warehouse_id = (p_payload->>'warehouseId')::uuid,
      notes = coalesce(p_payload->>'notes','')
    where id = v_id;
    delete from sales_lines where order_id = v_id;
  else
    insert into sales_orders (org_id, doc_no, customer_id, warehouse_id, status, notes, created_by)
    values (
      p_org, ss_next_no(p_org, 'sales'),
      nullif(p_payload->>'customerId','')::uuid,
      (p_payload->>'warehouseId')::uuid,
      'draft', coalesce(p_payload->>'notes',''), p_user
    ) returning id into v_id;
  end if;
  if jsonb_array_length(coalesce(p_payload->'lines','[]'::jsonb)) = 0 then
    raise exception 'SS:EMPTY';
  end if;
  for ln in select * from jsonb_array_elements(p_payload->'lines') loop
    i := i + 1;
    v_product := (ln->>'productId')::uuid;
    v_qty := (ln->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'SS:VALIDATION'; end if;
    select base_unit_id into v_base_unit from products where id = v_product and org_id = p_org;
    if not found then raise exception 'SS:NOT_FOUND'; end if;
    v_unit := nullif(ln->>'unitId','')::uuid;
    if v_unit is null or v_unit = v_base_unit then
      v_factor := 1; v_unit := v_base_unit;
    else
      select factor into v_factor from product_units where product_id = v_product and unit_id = v_unit;
      if not found then raise exception 'SS:UNIT'; end if;
    end if;
    v_base := round(v_qty * v_factor, 4);
    insert into sales_lines (order_id, org_id, product_id, qty, unit_id, factor, qty_base, unit_price, tax_rate, line_no)
    values (
      v_id, p_org, v_product, v_qty, v_unit, v_factor, v_base,
      coalesce(nullif(ln->>'unitPrice','')::numeric, 0),
      coalesce(nullif(ln->>'taxRate','')::numeric, 0), i
    );
  end loop;
  perform ss_audit(p_org, p_user, 'save', 'sales_order', v_id::text, '{}'::jsonb);
  return v_id;
end;
$$;
