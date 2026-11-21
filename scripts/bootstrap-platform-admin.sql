-- One-time, DBA-only bootstrap for the first Smart Stock AI platform admin.
-- Replace the email literal below with the address of an already registered user.
-- Run as a database superuser (or an owner permitted to alter this table).
BEGIN;
ALTER TABLE saas_platform_admins DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_email text := lower('REPLACE_WITH_ADMIN_EMAIL');
  v_user_id text;
BEGIN
  IF v_email = 'replace_with_admin_email' OR position('@' in v_email) < 2 THEN
    RAISE EXCEPTION 'Edit scripts/bootstrap-platform-admin.sql and set a real registered admin email first';
  END IF;

  SELECT id INTO v_user_id
  FROM "user"
  WHERE lower(email) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No registered user found for %', v_email;
  END IF;

  INSERT INTO saas_platform_admins (user_id, role, enabled, created_by)
  VALUES (v_user_id, 'super_admin', true, v_user_id)
  ON CONFLICT (user_id) DO UPDATE
    SET role = 'super_admin', enabled = true, updated_at = now();
END $$;

ALTER TABLE saas_platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_platform_admins FORCE ROW LEVEL SECURITY;
COMMIT;
