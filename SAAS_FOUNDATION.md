# Smart Stock AI — SaaS Foundation (Phase 1)

## Product decisions

- Initial market: Egypt and Arab countries.
- New organizations receive a 14-day trial.
- Shared PostgreSQL database with tenant isolation; dedicated databases can be added later for enterprise tenants.
- Existing `org_id` naming and inventory APIs are preserved to avoid a disruptive rewrite.

## Implemented in this phase

1. `migrations/0003_saas_foundation.sql`
   - Adds organization country/onboarding metadata.
   - Adds branches and assigns existing warehouses to a default branch.
   - Adds plans, regional plan-price records, subscriptions, usage events, and platform-admin identity records.
   - Adds the 14-day trial plan definition.
   - Adds tenant-aware composite foreign keys. They are initially `NOT VALID`: new writes are checked, while legacy data is left for an explicit audit/validation pass.
   - Enables and forces Row-Level Security on organization-owned application tables.
2. `src/lib/db-context.server.ts` and `src/lib/auth/middleware.ts`
   - Resolve organization IDs from authenticated memberships on the server.
   - Never accept the tenant list from the browser.
   - Carry the authenticated user and organization scope using AsyncLocalStorage.
3. `src/lib/db.ts`
   - Runs scoped SQL statements inside transactions and sets transaction-local `app.user_id` and `app.org_ids` values used by RLS.
   - Adds a transaction API so multi-step tenant creation can be atomic.
4. `src/lib/stock/api.ts`
   - Creates the organization, owner membership, default branch, starter data, 14-day trial subscription, audit record, and optional demo data in one transaction.
   - Returns the trial end timestamp.
   - Writes the organization ID into product-unit mappings.
5. Production startup requirements
   - Production requires `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `VITE_AUTH_ENABLED=true`.
   - `.grok/app-env.json` intentionally remains preview-oriented (`VITE_AUTH_ENABLED=false`); the production deployment must override this value explicitly.

## Important operating notes

- Run migrations with the deployment database configured. The current migration runner uses `DATABASE_URL` for migrations and runtime access.
- The application database connection must be kept server-side. Do not expose `DATABASE_URL` or `BETTER_AUTH_SECRET` through any `VITE_` variable.
- All current stock API server functions use `authMiddleware`; that middleware now loads membership scope before executing tenant queries.
- RLS protects tenant rows. Platform-wide plan definitions and regional price definitions are global reference data and are only accessed through server-side APIs.
- `saas_platform_admins` has no default administrator and normal application sessions cannot self-enroll. Bootstrap the first trusted platform administrator through a controlled database operation before implementing Super Admin routes. For bootstrap, use a privileged maintenance window to temporarily disable RLS on this one table, insert the approved admin, then re-enable and force RLS before returning traffic.
- No payment provider is wired in Phase 1. `saas_plan_prices` is ready for country/currency-specific EGP, SAR, AED, and other pricing records (minor-unit precision must follow the currency), but no prices have been invented or seeded.

## Required deployment configuration

- `DATABASE_URL`: production PostgreSQL connection.
- `BETTER_AUTH_SECRET`: long, random, private secret.
- `BETTER_AUTH_URL`: canonical HTTPS URL of the production app.
- `VITE_AUTH_ENABLED=true`: real authentication must be enabled in production.
- Configure the identity provider / Gate identity for the actual production domain.
- Keep `GEMINI_API_KEY` server-side; apply per-organization usage limits when the metering API is added in a later phase.

## Validation still required before production

- Run the full typecheck and production build after dependencies are installed.
- Execute the PGlite inventory-engine test including the new RLS checks.
- Apply migration 0003 against a staging PostgreSQL database and run cross-tenant data-integrity audits before validating the `NOT VALID` composite constraints.
- Verify RLS using the same authenticated middleware path used by the app, not only direct SQL tests.
- Verify sign-in with production identity configuration.
- Confirm backups and restore before accepting real customer data.

## Platform administration additions

See [PLATFORM_ADMIN.md](./PLATFORM_ADMIN.md) for the DBA-only first-admin
bootstrap and plan-market configuration. Migration `0004_platform_admin_console.sql`
adds an RLS-protected platform audit table. The `/platform` console allows an
explicitly bootstrapped `super_admin` to configure plan entitlement JSON and
country/currency price points; it does not enable checkout or payment processing.
