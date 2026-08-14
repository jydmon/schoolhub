import { prisma } from "./db";
import { recordAudit } from "./audit";
import { ROLES, ROLE_LABELS, ROLE_PERMISSIONS, SCHOOL_ROLES, PERMISSIONS } from "./constants";

// Item 12 — per-tenant RBAC (pragmatic override layer). Built-in defaults come
// from ROLE_PERMISSIONS; a TenantRole row overrides a built-in for one school or
// defines a custom role. This module resolves the effective config and provides
// the management operations. can() consults the resolved set via getAuthContext.

// ---- Catalogs (drive the Access Management UI) ----
export const PERMISSION_CATALOG: { key: string; label: string; group: string }[] = [
  { key: PERMISSIONS.MANAGE_SCHOOL_CONFIG, label: "Manage school configuration", group: "Admin" },
  { key: PERMISSIONS.MANAGE_USERS, label: "Manage users & roles", group: "Admin" },
  { key: PERMISSIONS.MANAGE_SUBSCRIPTION, label: "Manage subscription", group: "Admin" },
  { key: PERMISSIONS.VIEW_AUDIT, label: "View audit / history", group: "Admin" },
  { key: PERMISSIONS.VIEW_DASHBOARDS, label: "View dashboards", group: "Reports" },
  { key: PERMISSIONS.VIEW_REPORTS, label: "View reports & search", group: "Reports" },
  { key: PERMISSIONS.AUTHOR_REPORTS, label: "Author pupil reports", group: "Reports" },
  { key: PERMISSIONS.RELEASE_REPORTS, label: "Release pupil reports", group: "Reports" },
  { key: PERMISSIONS.MANAGE_CALENDAR, label: "Manage calendar & events", group: "Learning" },
  { key: PERMISSIONS.MANAGE_KNOWLEDGE, label: "Manage knowledge / documents", group: "Learning" },
  { key: PERMISSIONS.MANAGE_CONTENT, label: "Manage content (clubs, meals, FAQs)", group: "Learning" },
  { key: PERMISSIONS.VIEW_ASSIGNED_STUDENTS, label: "View assigned students", group: "Learning" },
  { key: PERMISSIONS.MANAGE_TRANSPORT, label: "Manage transport", group: "Transport" },
  { key: PERMISSIONS.MANAGE_TRIPS, label: "Manage trips", group: "Transport" },
  { key: PERMISSIONS.DRIVE_ROUTES, label: "Drive routes", group: "Transport" },
  { key: PERMISSIONS.MANAGE_INTEGRATIONS, label: "Manage integrations", group: "Data" },
  { key: PERMISSIONS.MANAGE_INTEGRATION_HUB, label: "Integration Hub admin", group: "Data" },
  { key: PERMISSIONS.MANAGE_CRM, label: "Manage CRM & campaigns", group: "Comms" },
];

export const PAGE_CATALOG: { key: string; label: string }[] = [
  { key: "ops", label: "Operations" }, { key: "students", label: "Students" }, { key: "guardians", label: "Guardians" },
  { key: "staff", label: "Staff" }, { key: "users", label: "Users & roles" }, { key: "calendar", label: "Calendar" },
  { key: "timetable", label: "Timetable" }, { key: "attendance", label: "Attendance" }, { key: "behaviour", label: "Behaviour" },
  { key: "reports", label: "Pupil reports" }, { key: "knowledge", label: "Knowledge" }, { key: "meals", label: "Meals & menus" },
  { key: "clubs", label: "Clubs & activities" }, { key: "transport", label: "Transport" }, { key: "trips", label: "Trips" },
  { key: "comms", label: "Comms" }, { key: "dm", label: "Messages" }, { key: "assistant", label: "AI Assistant" },
  { key: "import", label: "Manual import" }, { key: "integrations", label: "Integrations" }, { key: "hub", label: "Integration Hub" },
  { key: "config", label: "Configuration" }, { key: "insights", label: "Reports & search" }, { key: "audit", label: "History" },
];

export const CRUD_RESOURCES: { key: string; label: string }[] = [
  { key: "students", label: "Students" }, { key: "guardians", label: "Guardians" }, { key: "staff", label: "Staff" },
  { key: "calendar", label: "Calendar & events" }, { key: "clubs", label: "Clubs" }, { key: "meals", label: "Meals" },
  { key: "transport", label: "Transport" }, { key: "trips", label: "Trips" }, { key: "reports", label: "Pupil reports" },
  { key: "comms", label: "Communications" },
];

// Permission → default page access, so a built-in role has sensible pages.
const PERM_PAGES: Record<string, string[]> = {
  [PERMISSIONS.MANAGE_SCHOOL_CONFIG]: ["config", "ops"],
  [PERMISSIONS.MANAGE_USERS]: ["users", "staff", "guardians", "students"],
  [PERMISSIONS.VIEW_DASHBOARDS]: ["ops"],
  [PERMISSIONS.VIEW_REPORTS]: ["insights", "reports"],
  [PERMISSIONS.VIEW_AUDIT]: ["audit"],
  [PERMISSIONS.MANAGE_CALENDAR]: ["calendar", "timetable"],
  [PERMISSIONS.MANAGE_KNOWLEDGE]: ["knowledge"],
  [PERMISSIONS.MANAGE_CONTENT]: ["meals", "clubs"],
  [PERMISSIONS.AUTHOR_REPORTS]: ["reports"],
  [PERMISSIONS.RELEASE_REPORTS]: ["reports"],
  [PERMISSIONS.VIEW_ASSIGNED_STUDENTS]: ["students", "attendance", "behaviour"],
  [PERMISSIONS.MANAGE_TRANSPORT]: ["transport"],
  [PERMISSIONS.MANAGE_TRIPS]: ["trips"],
  [PERMISSIONS.MANAGE_INTEGRATIONS]: ["integrations"],
  [PERMISSIONS.MANAGE_INTEGRATION_HUB]: ["hub"],
  [PERMISSIONS.MANAGE_CRM]: ["comms", "dm"],
};

const ALL_PAGES = PAGE_CATALOG.map((p) => p.key);
function defaultPagesFor(perms: string[], roleKey?: string): string[] {
  if (roleKey === ROLES.SCHOOL_ADMIN) return ALL_PAGES; // admin sees everything
  const set = new Set<string>(["assistant"]);
  for (const p of perms) (PERM_PAGES[p] || []).forEach((pg) => set.add(pg));
  return ALL_PAGES.filter((k) => set.has(k));
}
function defaultCrudFor(perms: string[]): Record<string, any> {
  // Pragmatic default: full CRUD on resources the role can manage, read-only otherwise.
  const manage = new Set(perms);
  const canManageAll = manage.has(PERMISSIONS.MANAGE_SCHOOL_CONFIG) || manage.has(PERMISSIONS.MANAGE_USERS);
  const out: Record<string, any> = {};
  for (const r of CRUD_RESOURCES) {
    const full = canManageAll
      || (r.key === "transport" && manage.has(PERMISSIONS.MANAGE_TRANSPORT))
      || (r.key === "trips" && manage.has(PERMISSIONS.MANAGE_TRIPS))
      || (r.key === "calendar" && manage.has(PERMISSIONS.MANAGE_CALENDAR))
      || (["clubs", "meals"].includes(r.key) && manage.has(PERMISSIONS.MANAGE_CONTENT))
      || (r.key === "reports" && (manage.has(PERMISSIONS.AUTHOR_REPORTS) || manage.has(PERMISSIONS.RELEASE_REPORTS)));
    out[r.key] = full ? { create: true, read: true, update: true, delete: canManageAll } : { create: false, read: true, update: false, delete: false };
  }
  return out;
}

const parse = <T,>(json: string, fb: T): T => { try { return JSON.parse(json) as T; } catch { return fb; } };

export type RoleConfig = {
  key: string; name: string; baseRole: string | null; permissions: string[]; pages: string[]; crud: Record<string, any>;
  isCustom: boolean; builtin: boolean; enabled: boolean; overridden: boolean; assignable: boolean;
};

function builtinConfig(key: string): RoleConfig {
  const perms = (ROLE_PERMISSIONS[key] || []) as string[];
  return { key, name: ROLE_LABELS[key] || key, baseRole: null, permissions: perms, pages: defaultPagesFor(perms, key), crud: defaultCrudFor(perms), isCustom: false, builtin: true, enabled: true, overridden: false, assignable: true };
}
function rowConfig(row: any): RoleConfig {
  return { key: row.key, name: row.name, baseRole: row.baseRole || null, permissions: parse<string[]>(row.permissionsJson, []), pages: parse<string[]>(row.pagesJson, []), crud: parse<Record<string, any>>(row.crudJson, {}), isCustom: row.isCustom, builtin: !row.isCustom, enabled: row.enabled, overridden: !row.isCustom, assignable: row.enabled };
}

/** All roles for a school: built-ins (default or overridden) + custom roles. */
export async function listRoles(schoolId: string): Promise<RoleConfig[]> {
  const rows = await prisma.tenantRole.findMany({ where: { schoolId } });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out: RoleConfig[] = [];
  for (const key of SCHOOL_ROLES) {
    const row = byKey.get(key);
    out.push(row ? { ...rowConfig(row), name: row.name || (ROLE_LABELS[key] || key), builtin: true, isCustom: false } : builtinConfig(key));
  }
  for (const r of rows) if (r.isCustom) out.push(rowConfig(r));
  return out;
}

/** Pure resolver used by getAuthContext: effective permission keys for a user's roles. */
export function resolveEffectivePermissions(roleKeys: string[], rows: { key: string; enabled: boolean; permissionsJson: string; isCustom: boolean }[]): string[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const set = new Set<string>();
  for (const rk of roleKeys) {
    const row = byKey.get(rk);
    if (row) { if (!row.enabled) continue; for (const p of parse<string[]>(row.permissionsJson, [])) set.add(p); }
    else for (const p of (ROLE_PERMISSIONS[rk] || []) as string[]) set.add(p);
  }
  return Array.from(set);
}

/** Effective permissions + pages for a user (for /api/me/access).
 *  `customized` is true only when at least one of the user's roles in this
 *  school is backed by a stored TenantRole (an overridden built-in or a custom
 *  role). Clients MUST only gate navigation when `customized` is true — an
 *  untouched school falls back to platform defaults and nothing is hidden.
 *  `catalogPages` is the set of page keys that are eligible for gating; any nav
 *  key outside it (dashboard, help, profile, notifications, …) is never hidden. */
export async function effectiveForUser(schoolId: string, roleKeys: string[]) {
  const roles = await listRoles(schoolId);
  const byKey = new Map(roles.map((r) => [r.key, r]));
  const perms = new Set<string>(); const pages = new Set<string>();
  let customized = false;
  for (const rk of roleKeys) {
    const c = byKey.get(rk);
    if (!c || !c.enabled) continue;
    if (c.overridden || c.isCustom) customized = true;
    c.permissions.forEach((p) => perms.add(p));
    c.pages.forEach((p) => pages.add(p));
  }
  return { permissions: Array.from(perms), pages: Array.from(pages), customized, catalogPages: ALL_PAGES };
}

const slug = (s: string) => "custom_" + (s || "role").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) + Math.random().toString(36).slice(2, 5);

// ---- Mutations (all audited) ----
export async function createRole(schoolId: string, input: any, actorUserId?: string | null, cloneFromKey?: string) {
  const name = (input.name || "").trim(); if (!name) throw new Error("A role name is required.");
  let base: RoleConfig | null = null;
  if (cloneFromKey) { const roles = await listRoles(schoolId); base = roles.find((r) => r.key === cloneFromKey) || null; }
  const key = slug(name);
  const row = await prisma.tenantRole.create({
    data: {
      schoolId, key, name, baseRole: input.baseRole || (base && !base.isCustom ? base.key : base?.baseRole) || null,
      permissionsJson: JSON.stringify(input.permissions ?? base?.permissions ?? []),
      pagesJson: JSON.stringify(input.pages ?? base?.pages ?? []),
      crudJson: JSON.stringify(input.crud ?? base?.crud ?? {}),
      isCustom: true, enabled: true, createdById: actorUserId || null,
    },
  });
  await recordAudit({ action: "ROLE_CREATED", schoolId, actorUserId, targetType: "TenantRole", targetId: row.id, metadata: { key, name, clonedFrom: cloneFromKey || null } });
  return { key: row.key };
}

/** Save (override a built-in or edit a custom role). Upserts the TenantRole row. */
export async function saveRole(schoolId: string, key: string, input: any, actorUserId?: string | null) {
  const isBuiltin = (SCHOOL_ROLES as string[]).includes(key);
  const existing = await prisma.tenantRole.findUnique({ where: { schoolId_key: { schoolId, key } } }).catch(() => null);
  const data: any = {};
  if (typeof input.name === "string" && input.name.trim()) data.name = input.name.trim();
  if (input.permissions) data.permissionsJson = JSON.stringify(input.permissions);
  if (input.pages) data.pagesJson = JSON.stringify(input.pages);
  if (input.crud) data.crudJson = JSON.stringify(input.crud);
  if (typeof input.enabled === "boolean") data.enabled = input.enabled;
  if (existing) await prisma.tenantRole.update({ where: { id: existing.id }, data });
  else await prisma.tenantRole.create({ data: { schoolId, key, name: data.name || (ROLE_LABELS[key] || key), baseRole: isBuiltin ? key : null, permissionsJson: data.permissionsJson ?? JSON.stringify((ROLE_PERMISSIONS[key] || [])), pagesJson: data.pagesJson ?? "[]", crudJson: data.crudJson ?? "{}", isCustom: !isBuiltin, enabled: data.enabled ?? true, createdById: actorUserId || null } });
  await recordAudit({ action: "ROLE_UPDATED", schoolId, actorUserId, targetType: "TenantRole", targetId: key, metadata: { key, changes: Object.keys(data) } });
  return { ok: true };
}

export async function setEnabled(schoolId: string, key: string, enabled: boolean, actorUserId?: string | null) {
  await saveRole(schoolId, key, { enabled }, actorUserId);
  await recordAudit({ action: enabled ? "ROLE_ENABLED" : "ROLE_DISABLED", schoolId, actorUserId, targetType: "TenantRole", targetId: key, metadata: { key } });
}

/** Restore a built-in role to platform defaults (delete its override row). */
export async function restoreDefault(schoolId: string, key: string, actorUserId?: string | null) {
  if (!(SCHOOL_ROLES as string[]).includes(key)) throw new Error("Only built-in roles can be restored to defaults.");
  await prisma.tenantRole.deleteMany({ where: { schoolId, key } });
  await recordAudit({ action: "ROLE_RESTORED_DEFAULT", schoolId, actorUserId, targetType: "TenantRole", targetId: key, metadata: { key } });
  return { ok: true };
}

export async function deleteCustomRole(schoolId: string, key: string, actorUserId?: string | null) {
  const row = await prisma.tenantRole.findUnique({ where: { schoolId_key: { schoolId, key } } }).catch(() => null);
  if (!row || !row.isCustom) throw new Error("Only custom roles can be deleted.");
  const assigned = await prisma.membership.count({ where: { schoolId, role: key } });
  if (assigned > 0) throw new Error(`This role is assigned to ${assigned} user(s). Reassign them first.`);
  await prisma.tenantRole.delete({ where: { id: row.id } });
  await recordAudit({ action: "ROLE_DELETED", schoolId, actorUserId, targetType: "TenantRole", targetId: key, metadata: { key } });
  return { ok: true };
}

/** Assign a role (built-in or custom) to a user in this school. */
export async function assignRole(schoolId: string, userId: string, key: string, actorUserId?: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new Error("User not found.");
  const exists = await prisma.membership.findFirst({ where: { schoolId, userId, role: key } });
  if (!exists) await prisma.membership.create({ data: { schoolId, userId, role: key } });
  await recordAudit({ action: "ROLE_ASSIGNED", schoolId, actorUserId, targetType: "Membership", targetId: userId, metadata: { role: key } });
  return { ok: true };
}

export async function unassignRole(schoolId: string, userId: string, key: string, actorUserId?: string | null) {
  await prisma.membership.deleteMany({ where: { schoolId, userId, role: key } });
  await recordAudit({ action: "ROLE_UNASSIGNED", schoolId, actorUserId, targetType: "Membership", targetId: userId, metadata: { role: key } });
  return { ok: true };
}

/** Users in the school with their assigned role keys — for the assignment UI. */
export async function usersWithRoles(schoolId: string) {
  const ms = await prisma.membership.findMany({ where: { schoolId }, include: { user: { select: { id: true, fullName: true, email: true } } }, orderBy: { createdAt: "asc" } });
  const byUser = new Map<string, { id: string; name: string; email: string; roles: string[] }>();
  for (const m of ms) {
    const u = byUser.get(m.userId) || { id: m.userId, name: m.user.fullName, email: m.user.email, roles: [] };
    u.roles.push(m.role); byUser.set(m.userId, u);
  }
  return Array.from(byUser.values());
}

export async function roleHistory(schoolId: string) {
  const rows = await prisma.auditLog.findMany({ where: { schoolId, action: { startsWith: "ROLE_" } }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map((r) => ({ id: r.id, action: r.action, at: r.createdAt, actorEmail: r.actorEmail, metadata: (() => { try { return JSON.parse(r.metadata || "{}"); } catch { return {}; } })() }));
}
