-- Audited platform-level administration. Access is granted only through
-- saas_platform_admins; application users cannot enroll themselves.
create table if not exists saas_platform_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id text not null,
  action text not null,
  entity text not null,
  entity_id text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists saas_platform_audit_created_idx
  on saas_platform_audit (created_at desc);
create index if not exists saas_platform_audit_entity_idx
  on saas_platform_audit (entity, entity_id, created_at desc);

alter table saas_platform_audit enable row level security;
alter table saas_platform_audit force row level security;
drop policy if exists saas_platform_audit_admin_access on saas_platform_audit;
create policy saas_platform_audit_admin_access on saas_platform_audit
  using (exists (
    select 1 from saas_platform_admins a
    where a.user_id = ss_current_user_id() and a.enabled = true
  ))
  with check (exists (
    select 1 from saas_platform_admins a
    where a.user_id = ss_current_user_id() and a.enabled = true
  ));
