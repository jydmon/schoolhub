// Pure logic for SIPlat internal (platform) staff access control. This is a
// SEPARATE plane from tenant RBAC: it scopes which areas of the super-admin
// portal a SIPlat employee can open, based on their platform role. No DB here;
// DB flows live in src/lib/platform-staff.ts. Unit-tested in tests/phase17b.test.ts.

// The bookable areas of the super-admin portal.
export const PLATFORM_AREAS = [
  "overview",      // platform dashboard
  "tenants",       // schools
  "subscriptions", // billing / plans / approvals
  "analytics",     // user analytics
  "usage",         // system usage
  "crm",           // CRM + campaigns
  "templates",     // shared template library
  "comms",         // platform broadcast
  "help",          // help desk
  "troubleshooting",
  "access",        // tenant RBAC matrix (read)
  "cms",           // website + videos
  "policies",
  "audit",
  "team",          // SIPlat staff & access management
] as const;
export type PlatformArea = (typeof PLATFORM_AREAS)[number];

export const AREA_LABELS: Record<string, string> = {
  overview: "Platform dashboard", tenants: "Schools", subscriptions: "Subscriptions & billing",
  analytics: "User analytics", usage: "System usage", crm: "CRM & campaigns",
  templates: "Templates", comms: "Platform comms", help: "Help desk",
  troubleshooting: "Troubleshooting", access: "Tenant RBAC", cms: "Website CMS",
  policies: "Policies", audit: "Audit trail", team: "Team & access",
};

// Built-in platform roles for SIPlat staff. "team" (staff management) is owner-
// only by default. "*" means all areas.
export const PLATFORM_ROLES: { key: string; name: string; areas: string[] }[] = [
  { key: "owner",   name: "Owner / Super Admin", areas: ["*"] },
  { key: "billing", name: "Billing & Subscriptions", areas: ["overview", "tenants", "subscriptions", "analytics"] },
  { key: "support", name: "Support", areas: ["overview", "tenants", "help", "troubleshooting", "usage"] },
  { key: "sales",   name: "Sales & CRM", areas: ["overview", "crm", "templates", "comms"] },
  { key: "analyst", name: "Analyst (read-only)", areas: ["overview", "analytics", "usage", "subscriptions"] },
  { key: "content", name: "Content & Marketing", areas: ["overview", "cms", "templates", "crm"] },
];

export function isValidArea(a: string): a is PlatformArea {
  return (PLATFORM_AREAS as readonly string[]).includes(a);
}

/** Normalise an areas list: keep "*" as a wildcard, drop unknown keys, dedupe. */
export function normalizeAreas(areas: string[] | null | undefined): string[] {
  if (!areas || !areas.length) return [];
  if (areas.includes("*")) return ["*"];
  return Array.from(new Set(areas.filter(isValidArea)));
}

/** Can a role (by its area grant) open a given area? */
export function canAccessArea(grantedAreas: string[], area: string): boolean {
  const g = normalizeAreas(grantedAreas);
  if (g.includes("*")) return true;
  return g.includes(area);
}

/** The nav a staff member should see, given their role's areas and the full nav. */
export function visibleAreas(grantedAreas: string[], allAreas: string[] = PLATFORM_AREAS as unknown as string[]): string[] {
  const g = normalizeAreas(grantedAreas);
  if (g.includes("*")) return allAreas.slice();
  return allAreas.filter((a) => g.includes(a));
}

/** Validate a proposed staff role assignment. */
export function validateStaff(input: { email?: string; roleKey?: string }, roleKeys: string[]): { ok: boolean; reason: string } {
  if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return { ok: false, reason: "valid email required" };
  if (!input.roleKey || !roleKeys.includes(input.roleKey)) return { ok: false, reason: "unknown role" };
  return { ok: true, reason: "ok" };
}
