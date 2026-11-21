# Platform administration bootstrap

## What is implemented

- `/platform` is visible in the workspace navigation only to a user whose enabled
  row exists in `saas_platform_admins`.
- The server re-checks the role on every platform API request. Hiding the link is
  only a usability detail; it is not the access-control boundary.
- `support`, `operations`, and `super_admin` can view the plan catalogue and the
  platform change log. Only `super_admin` can change plan visibility, status,
  sort order, JSON entitlement limits/features, or country/currency price points.
- Market prices are entered as full currency amounts (for example `250.00`). The
  server converts them to integer minor units using `Intl` currency precision,
  then writes `saas_plan_prices`.
- Plan/price writes are written to `saas_platform_audit`. The table is protected
  by RLS and is readable/writable only by enabled platform admins.
- The application does not offer self-enrollment into the platform-admin table.

## Bootstrap the first super administrator

1. Create the person's normal Smart Stock AI user account first.
2. Open `scripts/bootstrap-platform-admin.sql` and replace
   `REPLACE_WITH_ADMIN_EMAIL` with the exact email address of that registered
   account (lowercase is recommended).
3. Run the script against the target PostgreSQL database as a DBA/superuser or
   another role allowed to alter `saas_platform_admins` and bypass its forced RLS.
4. Confirm that the script commits and that the email resolved to exactly the
   intended existing account. The script restores `ENABLE` and `FORCE ROW LEVEL
   SECURITY` before commit.
5. Ask the administrator to sign in again or refresh the app. The platform link
   appears in the navigation after the server resolves their role.

Do not expose the bootstrap SQL through a browser route, do not grant ordinary
application roles permission to insert into `saas_platform_admins`, and do not
put database credentials or admin passwords in this file.

## Configure initial plans

1. Open `/platform` as the bootstrapped `super_admin`.
2. Edit each plan's limits JSON. Supported resource dimensions currently enforced
   server-side are `products`, `warehouses`, `branches`, and `members`.
3. Add a country/currency price for each market you intend to sell into. The
   interface accepts full currency amounts; it stores minor units in PostgreSQL.
4. Keep `trial` private. Do not publish a paid plan until its limits, features,
   market prices, checkout provider, refund policy, and tax treatment are approved.

An empty or missing limit means that no cap is configured for that dimension; it
is not interpreted as zero. A numeric `0` is an explicit zero limit. The app
intentionally ships with no invented commercial prices or customer limits.

## Remaining before commercial billing

The platform screen configures plan catalogue, entitlement JSON, and country
prices only. It does not collect money, change an organization's subscription,
issue tax invoices, reconcile chargebacks, or process payment-provider webhooks.
Those require a selected provider, verified credentials, real webhook signature
validation, idempotency, and an end-to-end staging test before activation.

The customer-level global metrics view is also not enabled yet. It must be built
on an explicitly reviewed privileged reporting mechanism, not by weakening the
RLS policies that isolate tenant data.
