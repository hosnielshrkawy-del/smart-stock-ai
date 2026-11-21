-- Phase 2: document-to-ledger automation, cash management and partner subledgers.
-- All monetary movements are posted through the immutable double-entry journal.

create table if not exists finance_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  source_document_id uuid not null,
  document_type text not null check (document_type in ('sale','purchase')),
  document_no text not null,
  partner_type text not null check (partner_type in ('customer','supplier')),
  partner_id uuid not null,
  document_date date not null default current_date,
  due_date date,
  currency text not null default 'EGP',
  subtotal numeric(20,4) not null default 0 check (subtotal >= 0),
  tax_amount numeric(20,4) not null default 0 check (tax_amount >= 0),
  total_amount numeric(20,4) not null default 0 check (total_amount >= 0),
  paid_amount numeric(20,4) not null default 0 check (paid_amount >= 0),
  status text not null default 'open' check (status in ('open','partial','paid','reversed')),
  journal_entry_id uuid,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, source_document_id),
  unique (org_id, document_type, document_no),
  constraint finance_document_source_fk foreign key (source_document_id) references documents(id) on delete restrict,
  constraint finance_document_partner_check check (
    (document_type='sale' and partner_type='customer') or
    (document_type='purchase' and partner_type='supplier')
  ),
  constraint finance_document_journal_fk foreign key (org_id, journal_entry_id)
    references finance_journal_entries(org_id, id) on delete restrict
);
create index if not exists finance_documents_partner_idx on finance_documents(org_id, partner_type, partner_id, document_date desc);
create index if not exists finance_documents_due_idx on finance_documents(org_id, due_date) where status in ('open','partial');

create table if not exists finance_cash_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  account_kind text not null check (account_kind in ('cash','bank','wallet')),
  currency text not null default 'EGP',
  finance_account_id uuid not null,
  opening_balance numeric(20,4) not null default 0,
  active boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, finance_account_id),
  constraint finance_cash_account_ledger_fk foreign key (org_id, finance_account_id)
    references finance_accounts(org_id, id) on delete restrict
);
create index if not exists finance_cash_accounts_org_idx on finance_cash_accounts(org_id, active, account_kind);

create table if not exists finance_cash_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  transaction_no text not null,
  transaction_type text not null check (transaction_type in ('receipt','payment','transfer','expense','income')),
  transaction_date date not null,
  cash_account_id uuid not null,
  destination_cash_account_id uuid,
  partner_type text check (partner_type in ('customer','supplier','other')),
  partner_id uuid,
  offset_account_id uuid,
  amount numeric(20,4) not null check (amount > 0),
  currency text not null default 'EGP',
  reference text not null default '',
  description text not null,
  idempotency_key text not null,
  status text not null default 'posted' check (status in ('posted','reversed')),
  journal_entry_id uuid,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, transaction_no),
  unique (org_id, idempotency_key),
  constraint finance_cash_source_fk foreign key (org_id, cash_account_id)
    references finance_cash_accounts(org_id, id) on delete restrict,
  constraint finance_cash_destination_fk foreign key (org_id, destination_cash_account_id)
    references finance_cash_accounts(org_id, id) on delete restrict,
  constraint finance_cash_offset_fk foreign key (org_id, offset_account_id)
    references finance_accounts(org_id, id) on delete restrict,
  constraint finance_cash_journal_fk foreign key (org_id, journal_entry_id)
    references finance_journal_entries(org_id, id) on delete restrict,
  constraint finance_cash_transfer_check check (
    (transaction_type='transfer' and destination_cash_account_id is not null and destination_cash_account_id <> cash_account_id)
    or (transaction_type<>'transfer' and destination_cash_account_id is null)
  )
);
create index if not exists finance_cash_txn_date_idx on finance_cash_transactions(org_id, transaction_date desc, created_at desc);

create table if not exists finance_document_allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  finance_document_id uuid not null,
  cash_transaction_id uuid not null,
  amount numeric(20,4) not null check (amount > 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  reversed_by text,
  reversed_at timestamptz,
  unique (org_id, id),
  unique (org_id, finance_document_id, cash_transaction_id),
  constraint finance_allocation_document_fk foreign key (org_id, finance_document_id)
    references finance_documents(org_id, id) on delete restrict,
  constraint finance_allocation_cash_fk foreign key (org_id, cash_transaction_id)
    references finance_cash_transactions(org_id, id) on delete restrict
);
create index if not exists finance_allocations_doc_idx on finance_document_allocations(org_id, finance_document_id);

create table if not exists finance_bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  cash_account_id uuid not null,
  external_reference text not null default '',
  transaction_date date not null,
  description text not null default '',
  debit numeric(20,4) not null default 0 check (debit >= 0),
  credit numeric(20,4) not null default 0 check (credit >= 0),
  matched_transaction_id uuid,
  imported_at timestamptz not null default now(),
  unique (org_id, id),
  constraint finance_statement_account_fk foreign key (org_id, cash_account_id)
    references finance_cash_accounts(org_id, id) on delete restrict,
  constraint finance_statement_txn_fk foreign key (org_id, matched_transaction_id)
    references finance_cash_transactions(org_id, id) on delete restrict,
  constraint finance_statement_one_side check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);
create index if not exists finance_statement_unmatched_idx on finance_bank_statement_lines(org_id, cash_account_id, transaction_date) where matched_transaction_id is null;
create unique index if not exists finance_statement_external_ref_idx on finance_bank_statement_lines(org_id,cash_account_id,external_reference) where external_reference<>'';

create table if not exists finance_pending_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  source_document_id uuid not null references documents(id) on delete restrict,
  event_type text not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending','resolved','ignored')),
  created_at timestamptz not null default now(),
  resolved_by text,
  resolved_at timestamptz,
  unique (org_id, source_document_id)
);
create index if not exists finance_pending_events_idx on finance_pending_events(org_id,status,created_at desc);

-- Tenant isolation for every new financial table.
do $$ declare t text;
begin
  foreach t in array array['finance_documents','finance_cash_accounts','finance_cash_transactions','finance_document_allocations','finance_bank_statement_lines','finance_pending_events'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists %I on %I', t || '_tenant_isolation', t);
    execute format('create policy %I on %I using (org_id = any(ss_current_user_org_ids())) with check (org_id = any(ss_current_user_org_ids()))', t || '_tenant_isolation', t);
  end loop;
end $$;

-- Shared journal writer used by automated business events and cash transactions.
create or replace function ss_finance_post_entry(
  p_org uuid, p_user text, p_source_type text, p_source_id text,
  p_entry_date date, p_description text, p_idempotency_key text, p_lines jsonb
) returns uuid language plpgsql as $$
declare
  v_existing uuid; v_id uuid := gen_random_uuid(); v_no text; item jsonb; v_account uuid;
  v_debit numeric := 0; v_credit numeric := 0; v_line integer := 0; v_d numeric; v_c numeric;
begin
  perform ss_member(p_org, p_user);
  select id into v_existing from finance_journal_entries
   where org_id=p_org and idempotency_key=p_idempotency_key;
  if found then return v_existing; end if;
  if p_idempotency_key is null or length(p_idempotency_key)=0 or coalesce(jsonb_typeof(p_lines),'')<>'array' or jsonb_array_length(p_lines)<2 then
    raise exception 'SS:FINANCE_VALIDATION';
  end if;
  v_no := 'FJ-' || to_char(p_entry_date,'YYYYMMDD') || '-' || upper(substr(replace(v_id::text,'-',''),1,8));
  insert into finance_journal_entries(id,org_id,entry_no,entry_date,description,source_type,source_id,idempotency_key,created_by)
  values(v_id,p_org,v_no,p_entry_date,left(p_description,500),p_source_type,p_source_id,p_idempotency_key,p_user);
  for item in select * from jsonb_array_elements(p_lines) loop
    v_account := nullif(item->>'accountId','')::uuid;
    v_d := coalesce(nullif(item->>'debit','')::numeric,0);
    v_c := coalesce(nullif(item->>'credit','')::numeric,0);
    if v_account is null or v_d<0 or v_c<0 or ((v_d>0)=(v_c>0)) then raise exception 'SS:FINANCE_VALIDATION'; end if;
    if not exists(select 1 from finance_accounts where org_id=p_org and id=v_account and active) then raise exception 'SS:FINANCE_ACCOUNT_NOT_FOUND'; end if;
    v_line := v_line+1; v_debit := v_debit+v_d; v_credit := v_credit+v_c;
    insert into finance_journal_lines(org_id,entry_id,line_no,account_id,description,debit,credit)
    values(p_org,v_id,v_line,v_account,left(coalesce(item->>'description',''),240),v_d,v_c);
  end loop;
  if v_line<2 or v_debit<=0 or v_debit<>v_credit then raise exception 'SS:FINANCE_UNBALANCED_ENTRY'; end if;
  update finance_journal_entries set status='posted',posted_by=p_user where org_id=p_org and id=v_id;
  perform ss_audit(p_org,p_user,'post','finance_journal',v_id::text,jsonb_build_object('sourceType',p_source_type,'sourceId',p_source_id,'debit',v_debit,'credit',v_credit));
  return v_id;
end $$;

-- Post the accounting effect of an inventory document exactly once.
create or replace function ss_finance_post_stock_document() returns trigger language plpgsql as $$
declare
  v_org uuid := new.org_id; v_user text := coalesce(new.posted_by,new.created_by); v_lines jsonb := '[]'::jsonb;
  v_entry uuid; v_cash uuid; v_ar uuid; v_ap uuid; v_inventory uuid; v_revenue uuid; v_vat uuid; v_cogs uuid; v_expense uuid; v_equity uuid; v_vat_input uuid;
  v_subtotal numeric := 0; v_tax numeric := 0; v_total numeric := 0; v_cost numeric := 0; v_shipping numeric := 0;
  v_partner uuid; v_currency text; v_no text; v_date date := coalesce(new.posted_at::date,current_date); v_due date; v_terms text; v_days integer; v_type text;
begin
  if old.status='posted' or new.status<>'posted' then return new; end if;
  if exists(select 1 from finance_journal_entries where org_id=v_org and source_type='stock_document' and source_id=new.id::text) then return new; end if;
  select id into v_inventory from finance_accounts where org_id=v_org and code='1200';
  select id into v_ar from finance_accounts where org_id=v_org and code='1100';
  select id into v_ap from finance_accounts where org_id=v_org and code='2000';
  select id into v_revenue from finance_accounts where org_id=v_org and code='4000';
  select id into v_vat from finance_accounts where org_id=v_org and code='2100';
  select id into v_vat_input from finance_accounts where org_id=v_org and code='2110';
  select id into v_cash from finance_accounts where org_id=v_org and code='1000';
  select id into v_cogs from finance_accounts where org_id=v_org and code='5000';
  select id into v_expense from finance_accounts where org_id=v_org and code='6000';
  select id into v_equity from finance_accounts where org_id=v_org and code='3000';
  select currency into v_currency from organizations where id=v_org;
  v_type := new.doc_type;

  if new.reverses_id is not null then
    if exists(select 1 from finance_documents fd where fd.org_id=v_org and fd.source_document_id=new.reverses_id and fd.paid_amount>0) then
      raise exception 'SS:FINANCE_DOCUMENT_HAS_PAYMENTS';
    end if;
    select e.id into v_entry from finance_journal_entries e
      where e.org_id=v_org and e.source_type='stock_document' and e.source_id=new.reverses_id::text and e.status='posted' limit 1;
    if v_entry is not null and not exists(select 1 from finance_journal_entries where org_id=v_org and reverses_entry_id=v_entry) then
      v_entry := gen_random_uuid();
      insert into finance_journal_entries(id,org_id,entry_no,entry_date,description,source_type,source_id,idempotency_key,reverses_entry_id,created_by)
      select v_entry,v_org,'FJ-'||to_char(v_date,'YYYYMMDD')||'-'||upper(substr(replace(v_entry::text,'-',''),1,8)),v_date,
        'عكس مستند مخزني '||new.doc_no,'reversal',new.reverses_id::text,'stock-reversal:'||new.id::text,
        (select id from finance_journal_entries where org_id=v_org and source_type='stock_document' and source_id=new.reverses_id::text and status='posted' limit 1),v_user;
      insert into finance_journal_lines(org_id,entry_id,line_no,account_id,description,debit,credit)
      select org_id,v_entry,line_no,account_id,'عكس: '||description,credit,debit
      from finance_journal_lines where org_id=v_org and entry_id=(select reverses_entry_id from finance_journal_entries where id=v_entry);
      update finance_journal_entries set status='posted',posted_by=v_user where id=v_entry;
      update finance_documents set status='reversed' where org_id=v_org and source_document_id=new.reverses_id;
    end if;
    return new;
  end if;

  if v_type='dispatch' and new.sales_order_id is not null then
    select so.customer_id into v_partner from sales_orders so where so.org_id=v_org and so.id=new.sales_order_id;
    select coalesce(sum(x.qty*x.unit_price),0),coalesce(sum(x.qty*x.unit_price*x.tax_rate/100),0)
      into v_subtotal,v_tax
    from (
      select dl.product_id, sum(dl.qty) qty, coalesce(sl.unit_price,0) unit_price, coalesce(sl.tax_rate,0) tax_rate
      from (select product_id,sum(qty) qty from document_lines where org_id=v_org and document_id=new.id group by product_id) dl
      left join (select product_id,case when sum(qty)>0 then sum(qty*unit_price)/sum(qty) else 0 end unit_price,case when sum(qty*unit_price)>0 then sum(qty*unit_price*tax_rate)/sum(qty*unit_price) else 0 end tax_rate from sales_lines where order_id=new.sales_order_id group by product_id) sl
        on sl.product_id=dl.product_id
    ) x;
    select coalesce(sum(l.qty_base*l.unit_cost),0) into v_cost from ledger l
      where l.org_id=v_org and l.document_id=new.id and l.direction in ('dispatch','out');
    v_total := v_subtotal+v_tax;
    if v_total>0 then
      if v_partner is null then
        v_lines := jsonb_build_array(
          jsonb_build_object('accountId',v_cash,'debit',v_total,'credit',0,'description','مبيعات نقدية'),
          jsonb_build_object('accountId',v_revenue,'debit',0,'credit',v_subtotal,'description','إيرادات مبيعات')
        );
      else
        v_lines := jsonb_build_array(
          jsonb_build_object('accountId',v_ar,'debit',v_total,'credit',0,'description','ذمم عميل - فاتورة بيع'),
          jsonb_build_object('accountId',v_revenue,'debit',0,'credit',v_subtotal,'description','إيرادات مبيعات')
        );
      end if;
      if v_tax>0 then v_lines:=v_lines||jsonb_build_array(jsonb_build_object('accountId',v_vat,'debit',0,'credit',v_tax,'description','ضريبة مخرجات')); end if;
      if v_cost>0 then v_lines:=v_lines||jsonb_build_array(
        jsonb_build_object('accountId',v_cogs,'debit',v_cost,'credit',0,'description','تكلفة البضاعة المباعة'),
        jsonb_build_object('accountId',v_inventory,'debit',0,'credit',v_cost,'description','تخفيض المخزون')); end if;
      v_entry:=ss_finance_post_entry(v_org,v_user,'stock_document',new.id::text,v_date,'فاتورة بيع '||new.doc_no,'stock-document:'||new.id::text,v_lines);
      if v_partner is not null then
        insert into finance_documents(org_id,source_document_id,document_type,document_no,partner_type,partner_id,document_date,due_date,currency,subtotal,tax_amount,total_amount,journal_entry_id)
        values(v_org,new.id,'sale',new.doc_no,'customer',v_partner,v_date,v_date,v_currency,v_subtotal,v_tax,v_total,v_entry)
        on conflict(org_id,source_document_id) do nothing;
      end if;
    end if;
  elsif v_type='receipt' and new.purchase_order_id is not null then
    select po.supplier_id,po.shipping,s.payment_terms into v_partner,v_shipping,v_terms
      from purchase_orders po join suppliers s on s.org_id=po.org_id and s.id=po.supplier_id
      where po.org_id=v_org and po.id=new.purchase_order_id;
    select coalesce(sum(l.qty_base*l.unit_cost),0) into v_cost from ledger l where l.org_id=v_org and l.document_id=new.id and l.direction in ('in');
    select coalesce(sum(x.qty*x.unit_price),0),coalesce(sum(x.qty*x.unit_price*x.tax_rate/100),0)
      into v_subtotal,v_tax
    from (
      select dl.product_id,dl.qty,coalesce(pl.unit_price,0) unit_price,coalesce(pl.tax_rate,0) tax_rate
      from (select product_id,sum(qty) qty from document_lines where org_id=v_org and document_id=new.id group by product_id) dl
      left join (select product_id,case when sum(qty)>0 then sum(qty*unit_price)/sum(qty) else 0 end unit_price,case when sum(qty*unit_price)>0 then sum(qty*unit_price*tax_rate)/sum(qty*unit_price) else 0 end tax_rate from purchase_lines where order_id=new.purchase_order_id group by product_id) pl
        on pl.product_id=dl.product_id
    ) x;
    select case when coalesce(sum(pl.qty*pl.unit_price),0)>0
      then po.shipping*(v_subtotal/coalesce(sum(pl.qty*pl.unit_price),1)) else 0 end
      into v_shipping
    from purchase_orders po join purchase_lines pl on pl.order_id=po.id
    where po.org_id=v_org and po.id=new.purchase_order_id group by po.shipping;
    v_days:=nullif(regexp_replace(coalesce(v_terms,''),'[^0-9]','','g'),'')::integer;
    v_due:=case when v_days between 0 and 3650 then v_date+v_days else v_date end;
    v_total:=v_subtotal+v_tax+v_shipping;
    if v_partner is not null and v_total>0 then
      v_lines:=jsonb_build_array(
        jsonb_build_object('accountId',v_inventory,'debit',v_cost+v_shipping,'credit',0,'description','إضافة مخزون ومصاريف شحن'),
        jsonb_build_object('accountId',v_ap,'debit',0,'credit',v_total,'description','ذمم مورد - فاتورة شراء')
      );
      if v_tax>0 then v_lines:=v_lines||jsonb_build_array(jsonb_build_object('accountId',v_vat_input,'debit',v_tax,'credit',0,'description','ضريبة مدخلات')); end if;
      -- Reconcile any rounding/price-cost delta to inventory so the journal remains balanced.
      if v_cost+v_shipping+v_tax<>v_total then
        v_lines:=jsonb_build_array(
          jsonb_build_object('accountId',v_inventory,'debit',v_total-v_tax,'credit',0,'description','تكلفة المشتريات والشحن'),
          jsonb_build_object('accountId',v_vat_input,'debit',v_tax,'credit',0,'description','ضريبة مدخلات'),
          jsonb_build_object('accountId',v_ap,'debit',0,'credit',v_total,'description','ذمم المورد'));
      end if;
      v_entry:=ss_finance_post_entry(v_org,v_user,'stock_document',new.id::text,v_date,'فاتورة شراء '||new.doc_no,'stock-document:'||new.id::text,v_lines);
      insert into finance_documents(org_id,source_document_id,document_type,document_no,partner_type,partner_id,document_date,due_date,currency,subtotal,tax_amount,total_amount,journal_entry_id)
      values(v_org,new.id,'purchase',new.doc_no,'supplier',v_partner,v_date,v_due,v_currency,v_subtotal+v_shipping,v_tax,v_total,v_entry)
      on conflict(org_id,source_document_id) do nothing;
    end if;
  elsif v_type in ('damage','issue','adjustment','opening','consumption') then
    select coalesce(sum(l.qty_base*l.unit_cost) filter(where l.direction in ('out','dispatch')),0),
           coalesce(sum(l.qty_base*l.unit_cost) filter(where l.direction='in'),0)
      into v_subtotal,v_cost from ledger l where l.org_id=v_org and l.document_id=new.id;
    if v_type='opening' and v_cost>0 then
      v_lines:=jsonb_build_array(jsonb_build_object('accountId',v_inventory,'debit',v_cost,'credit',0,'description','رصيد مخزون افتتاحي'),jsonb_build_object('accountId',v_equity,'debit',0,'credit',v_cost,'description','حقوق ملكية افتتاحية'));
    elsif v_type='adjustment' then
      if v_subtotal>0 then v_lines:=v_lines||jsonb_build_array(jsonb_build_object('accountId',v_expense,'debit',v_subtotal,'credit',0,'description','نقص مخزون'),jsonb_build_object('accountId',v_inventory,'debit',0,'credit',v_subtotal,'description','تخفيض المخزون')); end if;
      if v_cost>0 then v_lines:=v_lines||jsonb_build_array(jsonb_build_object('accountId',v_inventory,'debit',v_cost,'credit',0,'description','زيادة مخزون'),jsonb_build_object('accountId',v_revenue,'debit',0,'credit',v_cost,'description','فروق جرد دائنة')); end if;
    elsif v_subtotal>0 and v_type in ('damage','issue','consumption') then
      v_lines:=jsonb_build_array(jsonb_build_object('accountId',v_expense,'debit',v_subtotal,'credit',0,'description','هالك/صرف مخزني'),jsonb_build_object('accountId',v_inventory,'debit',0,'credit',v_subtotal,'description','تخفيض المخزون'));
    end if;
    if jsonb_array_length(v_lines)>=2 then perform ss_finance_post_entry(v_org,v_user,'stock_document',new.id::text,v_date,'أثر مخزني '||new.doc_no,'stock-document:'||new.id::text,v_lines); end if;
  elsif v_type in ('return_in','return_out') or (v_type='receipt' and new.purchase_order_id is null) or (v_type='dispatch' and new.sales_order_id is null) then
    -- These documents need their commercial source/line prices before accounting.
    -- Queue them for review rather than inventing historical price or tax values.
    insert into finance_pending_events(org_id,source_document_id,event_type,message)
    values(v_org,new.id,
      case when v_type in ('return_in','return_out') then 'return_requires_source_invoice'
           when v_type='receipt' then 'receipt_requires_purchase_source' else 'dispatch_requires_sales_source' end,
      case when v_type in ('return_in','return_out') then 'مردود مخزني يحتاج ربطه بفاتورة البيع أو الشراء الأصلية قبل عكس القيمة والضريبة.'
           when v_type='receipt' then 'استلام مخزني غير مرتبط بأمر شراء يحتاج تحديد مصدر التكلفة قبل الترحيل المالي.'
           else 'صرف/تسليم غير مرتبط بأمر بيع يحتاج تحديد مصدر الإيراد قبل الترحيل المالي.' end)
    on conflict(org_id,source_document_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists finance_stock_document_posted_trg on documents;
create trigger finance_stock_document_posted_trg after update of status on documents
for each row when (new.status='posted') execute function ss_finance_post_stock_document();

-- Create a cash/bank movement and its journal entry atomically. Optional allocations
-- link receipts/payments to one or more open customer/supplier documents.
create or replace function ss_finance_post_cash(p_org uuid,p_user text,p_payload jsonb) returns uuid language plpgsql as $$
declare
  v_id uuid:=gen_random_uuid(); v_existing uuid; v_entry uuid; v_no text; v_type text; v_amount numeric; v_date date; v_key text;
  v_cash finance_cash_accounts%rowtype; v_dest finance_cash_accounts%rowtype; v_offset uuid; v_lines jsonb:='[]'::jsonb;
  v_alloc jsonb; v_doc finance_documents%rowtype; v_alloc_amount numeric; v_alloc_total numeric:=0; v_txn_total numeric;
  v_ar uuid; v_ap uuid; v_user_currency text; v_partner_type text; v_partner_id uuid;
begin
  perform ss_member(p_org,p_user);
  v_type:=p_payload->>'transactionType'; v_amount:=nullif(p_payload->>'amount','')::numeric;
  v_date:=nullif(p_payload->>'transactionDate','')::date; v_key:=nullif(p_payload->>'idempotencyKey','');
  if v_type is null or v_type not in ('receipt','payment','transfer','expense','income') or v_amount is null or v_amount<=0 or v_date is null or v_key is null then raise exception 'SS:FINANCE_VALIDATION'; end if;
  select id into v_existing from finance_cash_transactions where org_id=p_org and idempotency_key=v_key;
  if found then return v_existing; end if;
  select * into v_cash from finance_cash_accounts where org_id=p_org and id=(p_payload->>'cashAccountId')::uuid and active for update;
  if not found then raise exception 'SS:FINANCE_CASH_ACCOUNT_NOT_FOUND'; end if;
  select currency into v_user_currency from organizations where id=p_org;
  if v_cash.currency<>v_user_currency then raise exception 'SS:FINANCE_CURRENCY_NOT_ENABLED'; end if;
  v_offset:=nullif(p_payload->>'offsetAccountId','')::uuid;
  v_partner_type:=nullif(p_payload->>'partnerType',''); v_partner_id:=nullif(p_payload->>'partnerId','')::uuid;
  select id into v_ar from finance_accounts where org_id=p_org and code='1100';
  select id into v_ap from finance_accounts where org_id=p_org and code='2000';
  if v_type='transfer' then
    select * into v_dest from finance_cash_accounts where org_id=p_org and id=(p_payload->>'destinationCashAccountId')::uuid and active for update;
    if not found or v_dest.id=v_cash.id then raise exception 'SS:FINANCE_CASH_ACCOUNT_NOT_FOUND'; end if;
    if v_dest.currency<>v_cash.currency then raise exception 'SS:FINANCE_CURRENCY_MISMATCH'; end if;
    v_lines:=jsonb_build_array(jsonb_build_object('accountId',v_dest.finance_account_id,'debit',v_amount,'credit',0,'description','تحويل وارد'),jsonb_build_object('accountId',v_cash.finance_account_id,'debit',0,'credit',v_amount,'description','تحويل صادر'));
  elsif v_type='receipt' then
    v_offset:=v_ar;
    v_lines:=jsonb_build_array(jsonb_build_object('accountId',v_cash.finance_account_id,'debit',v_amount,'credit',0,'description','سند قبض'),jsonb_build_object('accountId',v_offset,'debit',0,'credit',v_amount,'description','مقابل سند قبض'));
  elsif v_type='payment' then
    v_offset:=v_ap;
    v_lines:=jsonb_build_array(jsonb_build_object('accountId',v_offset,'debit',v_amount,'credit',0,'description','سند صرف'),jsonb_build_object('accountId',v_cash.finance_account_id,'debit',0,'credit',v_amount,'description','مدفوعات'));
  elsif v_type='expense' then
    if v_offset is null or not exists(select 1 from finance_accounts where org_id=p_org and id=v_offset and active and account_type='expense') then raise exception 'SS:FINANCE_ACCOUNT_NOT_FOUND'; end if;
    v_lines:=jsonb_build_array(jsonb_build_object('accountId',v_offset,'debit',v_amount,'credit',0,'description','مصروف نقدي'),jsonb_build_object('accountId',v_cash.finance_account_id,'debit',0,'credit',v_amount,'description','سداد مصروف'));
  else
    if v_offset is null or not exists(select 1 from finance_accounts where org_id=p_org and id=v_offset and active and account_type='revenue') then raise exception 'SS:FINANCE_ACCOUNT_NOT_FOUND'; end if;
    v_lines:=jsonb_build_array(jsonb_build_object('accountId',v_cash.finance_account_id,'debit',v_amount,'credit',0,'description','إيراد محصل'),jsonb_build_object('accountId',v_offset,'debit',0,'credit',v_amount,'description','إيراد'));
  end if;
  v_no:='CS-'||to_char(v_date,'YYYYMMDD')||'-'||upper(substr(replace(v_id::text,'-',''),1,8));
  insert into finance_cash_transactions(id,org_id,transaction_no,transaction_type,transaction_date,cash_account_id,destination_cash_account_id,partner_type,partner_id,offset_account_id,amount,currency,reference,description,idempotency_key,created_by)
  values(v_id,p_org,v_no,v_type,v_date,v_cash.id,case when v_type='transfer' then v_dest.id else null end,v_partner_type,v_partner_id,v_offset,v_amount,v_cash.currency,left(coalesce(p_payload->>'reference',''),160),left(coalesce(p_payload->>'description',''),500),v_key,p_user)
  on conflict (org_id,idempotency_key) do nothing returning id into v_existing;
  if v_existing is null then
    select id into v_existing from finance_cash_transactions where org_id=p_org and idempotency_key=v_key;
    return v_existing;
  end if;
  v_entry:=ss_finance_post_entry(p_org,p_user,'cash_transaction',v_id::text,v_date,coalesce(nullif(p_payload->>'description',''),v_no),'cash:'||v_key,v_lines);
  update finance_cash_transactions set journal_entry_id=v_entry where org_id=p_org and id=v_id;
  for v_alloc in select * from jsonb_array_elements(coalesce(p_payload->'allocations','[]'::jsonb)) loop
    v_alloc_amount:=nullif(v_alloc->>'amount','')::numeric;
    if v_alloc_amount is null or v_alloc_amount<=0 then raise exception 'SS:FINANCE_ALLOCATION_INVALID'; end if;
    select * into v_doc from finance_documents where org_id=p_org and id=(v_alloc->>'financeDocumentId')::uuid for update;
    if not found or v_doc.status='reversed' then raise exception 'SS:FINANCE_DOCUMENT_NOT_FOUND'; end if;
    if (v_type='receipt' and v_doc.document_type<>'sale') or (v_type='payment' and v_doc.document_type<>'purchase') or v_type not in ('receipt','payment') then raise exception 'SS:FINANCE_ALLOCATION_INVALID'; end if;
    if v_partner_id is not null and v_doc.partner_id<>v_partner_id then raise exception 'SS:FINANCE_PARTNER_MISMATCH'; end if;
    if v_partner_type is not null and v_doc.partner_type<>v_partner_type then raise exception 'SS:FINANCE_PARTNER_MISMATCH'; end if;
    if v_partner_id is null then v_partner_id:=v_doc.partner_id; v_partner_type:=v_doc.partner_type; end if;
    if v_doc.paid_amount+v_alloc_amount>v_doc.total_amount then raise exception 'SS:FINANCE_OVER_ALLOCATION'; end if;
    v_alloc_total:=v_alloc_total+v_alloc_amount;
    insert into finance_document_allocations(org_id,finance_document_id,cash_transaction_id,amount,created_by)
    values(p_org,v_doc.id,v_id,v_alloc_amount,p_user);
    update finance_documents set paid_amount=paid_amount+v_alloc_amount,
      status=case when paid_amount+v_alloc_amount>=total_amount then 'paid' else 'partial' end
    where org_id=p_org and id=v_doc.id;
  end loop;
  if v_alloc_total>v_amount then raise exception 'SS:FINANCE_OVER_ALLOCATION'; end if;
  perform ss_audit(p_org,p_user,'post','finance_cash_transaction',v_id::text,jsonb_build_object('type',v_type,'amount',v_amount,'journalEntryId',v_entry));
  return v_id;
end $$;

-- Explicitly match an imported bank statement line to a posted cash transaction.
create or replace function ss_finance_match_bank_line(p_org uuid,p_user text,p_line uuid,p_txn uuid) returns void language plpgsql as $$
declare v_line finance_bank_statement_lines%rowtype; v_txn finance_cash_transactions%rowtype;
begin
  perform ss_member(p_org,p_user);
  select * into v_line from finance_bank_statement_lines where org_id=p_org and id=p_line for update;
  select * into v_txn from finance_cash_transactions where org_id=p_org and id=p_txn and status='posted' for update;
  if v_line.id is null or v_txn.id is null or v_line.matched_transaction_id is not null then raise exception 'SS:FINANCE_RECONCILIATION_INVALID'; end if;
  if (v_txn.transaction_type='transfer' and not (
        (v_line.cash_account_id=v_txn.cash_account_id and v_line.credit=v_txn.amount) or
        (v_line.cash_account_id=v_txn.destination_cash_account_id and v_line.debit=v_txn.amount)))
    or (v_txn.transaction_type<>'transfer' and v_line.cash_account_id<>v_txn.cash_account_id)
    or (v_txn.transaction_type<>'transfer' and (v_line.debit+v_line.credit)<>v_txn.amount)
    or (v_txn.transaction_type in ('receipt','income') and v_line.debit<>v_txn.amount)
    or (v_txn.transaction_type in ('payment','expense') and v_line.credit<>v_txn.amount)
  then raise exception 'SS:FINANCE_RECONCILIATION_MISMATCH'; end if;
  update finance_bank_statement_lines set matched_transaction_id=v_txn.id where org_id=p_org and id=p_line;
  perform ss_audit(p_org,p_user,'match','finance_bank_statement_line',p_line::text,jsonb_build_object('cashTransactionId',p_txn));
end $$;

-- Keep financial document balances consistent with allocation rows.
create or replace function ss_finance_recalculate_document(p_org uuid,p_document uuid) returns void language plpgsql as $$
declare v_paid numeric; v_total numeric;
begin
  select coalesce(sum(amount),0) into v_paid from finance_document_allocations where org_id=p_org and finance_document_id=p_document and reversed_at is null;
  select total_amount into v_total from finance_documents where org_id=p_org and id=p_document for update;
  update finance_documents set paid_amount=v_paid,
    status=case when status='reversed' then 'reversed' when v_paid<=0 then 'open' when v_paid>=v_total then 'paid' else 'partial' end
  where org_id=p_org and id=p_document;
end $$;


create or replace function ss_finance_reverse_cash(p_org uuid,p_user text,p_transaction uuid,p_reason text,p_key text) returns uuid language plpgsql as $$
declare v_txn finance_cash_transactions%rowtype; v_original uuid; v_reverse uuid:=gen_random_uuid(); v_date date:=current_date; v_no text;
begin
  perform ss_member(p_org,p_user);
  if p_key is null or length(p_key)=0 or length(coalesce(p_reason,''))=0 then raise exception 'SS:FINANCE_VALIDATION'; end if;
  select id,source_id into v_original,v_no from finance_journal_entries where org_id=p_org and idempotency_key=p_key;
  if found then
    if v_no<>p_transaction::text then raise exception 'SS:FINANCE_IDEMPOTENCY_CONFLICT'; end if;
    return v_original;
  end if;
  select * into v_txn from finance_cash_transactions where org_id=p_org and id=p_transaction for update;
  if not found then raise exception 'SS:FINANCE_CASH_TRANSACTION_NOT_FOUND'; end if;
  if v_txn.status='reversed' then raise exception 'SS:FINANCE_ALREADY_REVERSED'; end if;
  v_original:=v_txn.journal_entry_id;
  if v_original is null then raise exception 'SS:FINANCE_JOURNAL_NOT_FOUND'; end if;
  if exists(select 1 from finance_journal_entries where org_id=p_org and reverses_entry_id=v_original) then raise exception 'SS:FINANCE_ALREADY_REVERSED'; end if;
  v_no:='FJ-'||to_char(v_date,'YYYYMMDD')||'-'||upper(substr(replace(v_reverse::text,'-',''),1,8));
  insert into finance_journal_entries(id,org_id,entry_no,entry_date,description,source_type,source_id,idempotency_key,reverses_entry_id,created_by)
  values(v_reverse,p_org,v_no,v_date,'عكس سند '||v_txn.transaction_no||': '||left(p_reason,300),'cash_reversal',v_txn.id::text,p_key,v_original,p_user);
  insert into finance_journal_lines(org_id,entry_id,line_no,account_id,description,debit,credit)
  select org_id,v_reverse,line_no,account_id,'عكس سند: '||left(p_reason,240),credit,debit
  from finance_journal_lines where org_id=p_org and entry_id=v_original;
  update finance_journal_entries set status='posted',posted_by=p_user where org_id=p_org and id=v_reverse;
  update finance_cash_transactions set status='reversed' where org_id=p_org and id=p_transaction;
  update finance_document_allocations set reversed_by=p_user,reversed_at=now()
    where org_id=p_org and cash_transaction_id=p_transaction and reversed_at is null;
  for v_original in select distinct finance_document_id from finance_document_allocations where org_id=p_org and cash_transaction_id=p_transaction loop
    perform ss_finance_recalculate_document(p_org,v_original);
  end loop;
  update finance_bank_statement_lines set matched_transaction_id=null where org_id=p_org and matched_transaction_id=p_transaction;
  perform ss_audit(p_org,p_user,'reverse','finance_cash_transaction',p_transaction::text,jsonb_build_object('reversalEntryId',v_reverse,'reason',p_reason));
  return v_reverse;
end $$;
