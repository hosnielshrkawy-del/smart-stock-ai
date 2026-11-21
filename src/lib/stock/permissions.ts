export const ROLES = [
  "owner",
  "administrator",
  "manager",
  "warehouse_manager",
  "warehouse_operator",
  "purchasing",
  "sales",
  "accountant",
  "auditor",
  "viewer",
] as const;

export type Role = (typeof ROLES)[number];

export const PERMS = [
  "products.view",
  "products.write",
  "products.archive",
  "stock.view",
  "stock.post",
  "stock.reverse",
  "stocktake.post",
  "cost.view",
  "purchasing.view",
  "purchasing.write",
  "purchasing.approve",
  "sales.view",
  "sales.write",
  "partners.write",
  "reports.view",
  "settings.write",
  "team.write",
  "ai.use",
  "finance.view",
  "finance.write",
] as const;

export type Perm = (typeof PERMS)[number];

const ALL = new Set<Perm>(PERMS);

const ROLE_PERMS: Record<Role, Perm[]> = {
  owner: [...PERMS],
  administrator: PERMS.filter((p) => p !== "team.write"),
  manager: [
    "products.view",
    "products.write",
    "products.archive",
    "stock.view",
    "stock.post",
    "stock.reverse",
    "stocktake.post",
    "cost.view",
    "purchasing.view",
    "purchasing.write",
    "purchasing.approve",
    "sales.view",
    "sales.write",
    "partners.write",
    "reports.view",
    "ai.use",
    "finance.view",
    "finance.write",
  ],
  warehouse_manager: [
    "products.view",
    "stock.view",
    "stock.post",
    "stock.reverse",
    "stocktake.post",
    "purchasing.view",
    "sales.view",
    "reports.view",
    "ai.use",
  ],
  warehouse_operator: ["products.view", "stock.view", "stock.post", "sales.view"],
  purchasing: [
    "products.view",
    "stock.view",
    "purchasing.view",
    "purchasing.write",
    "partners.write",
    "reports.view",
    "cost.view",
    "ai.use",
  ],
  sales: ["products.view", "stock.view", "sales.view", "sales.write", "partners.write", "reports.view"],
  accountant: [
    "finance.view",
    "finance.write",
    "products.view",
    "stock.view",
    "cost.view",
    "purchasing.view",
    "sales.view",
    "reports.view",
    "ai.use",
  ],
  auditor: [
    "finance.view",
    "products.view",
    "stock.view",
    "cost.view",
    "purchasing.view",
    "sales.view",
    "reports.view",
  ],
  viewer: ["products.view", "stock.view", "purchasing.view", "sales.view", "reports.view"],
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function effectivePerms(role: string, grants: unknown, revokes: unknown): Set<Perm> {
  if (role === "owner") return new Set(ALL);
  const base = new Set<Perm>(isRole(role) ? ROLE_PERMS[role] : []);
  const grantList = Array.isArray(grants) ? grants : [];
  const revokeList = Array.isArray(revokes) ? revokes : [];
  for (const g of grantList) {
    if ((PERMS as readonly string[]).includes(String(g))) base.add(g as Perm);
  }
  for (const r of revokeList) base.delete(r as Perm);
  return base;
}

export function can(
  role: string,
  grants: unknown,
  revokes: unknown,
  perm: Perm,
): boolean {
  return effectivePerms(role, grants, revokes).has(perm);
}
