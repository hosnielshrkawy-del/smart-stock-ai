-- Finance foundation: tenant-scoped chart of accounts and immutable double-entry journal.
create table if not exists finance_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name_ar text not null,
  name_en text not null default '',
  account_type text not null check (account_type in ('asset','liability','equity','revenue','expense')),
  parent_id uuid,
  is_system boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, code),
  constraint finance_accounts_parent_tenant_fk
    foreign key (org_id, parent_id) references finance_accounts(org_id, id) on delete restrict
);
create index if not exists finance_accounts_org_type_idx on finance_accounts(org_id, account_type, code);

create table if not exists finance_journal_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  entry_no text not null,
  entry_date date not null default current_date,
  description text not null,
  source_type text not null default 'manual',
  source_id text,
  idempotency_key text,
  status text not null default 'draft' check (status in ('draft','posted')),
  reverses_entry_id uuid,
  created_by text not null,
  posted_by text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, entry_no),
  constraint finance_journal_reversal_tenant_fk
    foreign key (org_id, reverses_entry_id) references finance_journal_entries(org_id, id) on delete restrict
);
create unique index if not exists finance_journal_idempotency_idx
  on finance_journal_entries(org_id, idempotency_key) where idempotency_key is not null;
create index if not exists finance_journal_date_idx on finance_journal_entries(org_id, entry_date desc, created_at desc);
create unique index if not exists finance_journal_reversal_idx on finance_journal_entries(org_id, reverses_entry_id) where reverses_entry_id is not null;

create table if not exists finance_journal_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  entry_id uuid not null,
  line_no integer not null,
  account_id uuid not null,
  description text not null default '',
  debit numeric(20,4) not null default 0 check (debit >= 0),
  credit numeric(20,4) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now(),
  unique (org_id, entry_id, line_no),
  constraint finance_lines_entry_tenant_fk
    foreign key (org_id, entry_id) references finance_journal_entries(org_id, id) on delete restrict,
  constraint finance_lines_account_tenant_fk
    foreign key (org_id, account_id) references finance_accounts(org_id, id) on delete restrict,
  constraint finance_lines_one_side_check check (
    (debit > 0 and credit = 0) or (credit > 0 and debit = 0)
  )
);
create index if not exists finance_lines_account_idx on finance_journal_lines(org_id, account_id, entry_id);

create or replace function ss_finance_guard_entry() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'posted' then raise exception 'SS:FINANCE_POSTED_IMMUTABLE'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'posted' then raise exception 'SS:FINANCE_POSTED_IMMUTABLE'; end if;
  end if;
  if new.status = 'posted' then
    if not exists (
      select 1 from finance_journal_lines l
      where l.org_id = new.org_id and l.entry_id = new.id
      group by l.org_id, l.entry_id
      having count(*) >= 2 and sum(l.debit) = sum(l.credit) and sum(l.debit) > 0
    ) then
      raise exception 'SS:FINANCE_UNBALANCED_ENTRY';
    end if;
    new.posted_at := coalesce(new.posted_at, now());
  end if;
  return new;
end;
$$;
drop trigger if exists finance_entry_guard_trg on finance_journal_entries;
create trigger finance_entry_guard_trg
before insert or update or delete on finance_journal_entries
for each row execute function ss_finance_guard_entry();

create or replace function ss_finance_guard_line() returns trigger language plpgsql as $$
declare v_org uuid; v_entry uuid;
begin
  v_org := coalesce(new.org_id, old.org_id);
  v_entry := coalesce(new.entry_id, old.entry_id);
  if exists (select 1 from finance_journal_entries e where e.org_id=v_org and e.id=v_entry and e.status='posted') then
    raise exception 'SS:FINANCE_POSTED_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists finance_line_guard_trg on finance_journal_lines;
create trigger finance_line_guard_trg
before insert or update or delete on finance_journal_lines
for each row execute function ss_finance_guard_line();

-- Every organization receives a standard starter chart. Custom accounts can be added later.
insert into finance_accounts (org_id, code, name_ar, name_en, account_type, is_system)
select o.id, a.code, a.name_ar, a.name_en, a.account_type, true
from organizations o
cross join (values
  ('1000','الصندوق','Cash','asset'),
  ('1010','البنوك','Bank accounts','asset'),
  ('1100','العملاء','Accounts receivable','asset'),
  ('1200','المخزون','Inventory','asset'),
  ('2000','الموردون','Accounts payable','liability'),
  ('2100','ضريبة القيمة المضافة المستحقة','VAT payable','liability'),
  ('3000','رأس المال','Owner equity','equity'),
  ('4000','إيرادات المبيعات','Sales revenue','revenue'),
  ('4100','إيرادات أخرى','Other income','revenue'),
  ('5000','تكلفة البضاعة المباعة','Cost of goods sold','expense'),
  ('6000','مصروفات تشغيلية','Operating expenses','expense')
) as a(code, name_ar, name_en, account_type)
on conflict (org_id, code) do nothing;

-- Tenant isolation follows the same verified organization scope as the core ERP tables.
do $$ declare t text;
begin
  foreach t in array array['finance_accounts','finance_journal_entries','finance_journal_lines'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists %I on %I', t || '_tenant_isolation', t);
    execute format(
      'create policy %I on %I using (org_id = any(ss_current_user_org_ids())) with check (org_id = any(ss_current_user_org_ids()))',
      t || '_tenant_isolation', t
    );
  end loop;
end $$;
