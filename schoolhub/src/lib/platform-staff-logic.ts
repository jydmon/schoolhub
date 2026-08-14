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
  // Account Manager: owns a geographic portfolio of schools (by county/state
  // and/or country). Sees the schools they cover plus those schools' billing.
  { key: "account_manager", name: "Account Manager", areas: ["overview", "tenants", "subscriptions"] },
];

/** The role key whose staff carry a geographic (county/country) portfolio. */
export const GEO_SCOPED_ROLE = "account_manager";

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

// ---- Account Manager geographic scope ------------------------------------
// A scope is two name lists: counties/states and countries. A school falls in a
// manager's portfolio when its county matches one of the manager's counties, OR
// its country matches one of the manager's countries (case-insensitive, trimmed).

const norm = (s: string | null | undefined): string => String(s ?? "").trim().toLowerCase();

/** Clean a scope list: trim, drop blanks, dedupe (preserving first-seen case). */
export function normalizeScope(v: string[] | null | undefined): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = []; const seen = new Set<string>();
  for (const raw of v) { const t = String(raw ?? "").trim(); const k = t.toLowerCase(); if (t && !seen.has(k)) { seen.add(k); out.push(t); } }
  return out;
}

export type GeoScope = { counties: string[]; countries: string[] };

/** Does an Account Manager's geo scope cover a given school? */
export function managerCoversSchool(scope: GeoScope, school: { county?: string | null; country?: string | null }): boolean {
  const counties = (scope.counties || []).map(norm);
  const countries = (scope.countries || []).map(norm);
  const sc = norm(school.county), sn = norm(school.country);
  if (counties.length && sc && counties.includes(sc)) return true;
  if (countries.length && sn && countries.includes(sn)) return true;
  return false;
}

/** Human-readable summary of a geo scope, e.g. "Kent, Essex · United Kingdom". */
export function describeScope(scope: GeoScope): string {
  const parts: string[] = [];
  if (scope.counties?.length) parts.push(scope.counties.join(", "));
  if (scope.countries?.length) parts.push(scope.countries.join(", "));
  return parts.join(" · ");
}

/** Validate a proposed staff role assignment. */
export function validateStaff(input: { email?: string; roleKey?: string }, roleKeys: string[]): { ok: boolean; reason: string } {
  if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return { ok: false, reason: "valid email required" };
  if (!input.roleKey || !roleKeys.includes(input.roleKey)) return { ok: false, reason: "unknown role" };
  return { ok: true, reason: "ok" };
}
