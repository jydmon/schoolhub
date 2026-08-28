import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";
import { hashPassword } from "./auth";
import { PLATFORM_ROLES, validateStaff, normalizeAreas, canAccessArea, normalizeScope, managerCoversSchool } from "./platform-staff-logic";

// SIPlat internal staff & access management (platform plane, separate from tenant
// RBAC). Seeds built-in platform roles, lists/creates/updates staff, and answers
// "can this staff member open area X?". Governs the super-admin portal only.

/** Ensure the built-in platform roles exist (idempotent). */
export async function ensurePlatformRoles(): Promise<void> {
  for (const r of PLATFORM_ROLES) {
    await prisma.platformRole.upsert({
      where: { key: r.key },
      update: { name: r.name, areasJson: JSON.stringify(r.areas), isSystem: true },
      create: { key: r.key, name: r.name, areasJson: JSON.stringify(r.areas), isSystem: true },
    });
  }
}

export async function listRoles() {
  const roles = await prisma.platformRole.findMany({ orderBy: { key: "asc" } });
  return roles.map((r) => ({ key: r.key, name: r.name, areas: safeArr(r.areasJson), isSystem: r.isSystem }));
}

/** Create (or update) a custom platform staff role from a name + area list. */
export async function createPlatformRole(input: {
  name: string; key?: string; areas: string[]; actorUserId?: string | null;
}): Promise<{ key: string; name: string; areas: string[] }> {
  const name = (input.name || "").trim();
  if (name.length < 2) throw new Error("Role name is required");
  const key = (input.key?.trim() || name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  if (!key) throw new Error("Could not derive a valid role key from the name");
  const areas = normalizeAreas(input.areas);
  if (!areas.length) throw new Error("Select at least one area for the role");
  const existing = await prisma.platformRole.findUnique({ where: { key } });
  if (existing?.isSystem) throw new Error("A built-in role already uses that name — choose another");
  const r = await prisma.platformRole.upsert({
    where: { key },
    update: { name, areasJson: JSON.stringify(areas) },
    create: { key, name, areasJson: JSON.stringify(areas), isSystem: false },
  });
  await recordAudit({ action: AUDIT.STAFF_UPDATED, actorUserId: input.actorUserId, targetType: "PlatformRole", targetId: r.id, metadata: { key, name, areas, action: "role_saved" } });
  return { key: r.key, name: r.name, areas };
}

/** Delete a custom platform role (built-in roles and in-use roles are protected). */
export async function deletePlatformRole(key: string, actor?: { userId?: string | null }): Promise<void> {
  const role = await prisma.platformRole.findUnique({ where: { key }, include: { staff: true } });
  if (!role) throw new Error("Role not found");
  if (role.isSystem) throw new Error("Built-in roles cannot be deleted");
  if (role.staff.length) throw new Error("Reassign staff off this role before deleting it");
  await prisma.platformRole.delete({ where: { key } });
  await recordAudit({ action: AUDIT.STAFF_REMOVED, actorUserId: actor?.userId, targetType: "PlatformRole", targetId: role.id, metadata: { key, action: "role_deleted" } });
}

export async function listStaff() {
  const staff = await prisma.platformStaff.findMany({ orderBy: { createdAt: "asc" }, include: { role: true } });
  return staff.map((s) => ({
    id: s.id, userId: s.userId, email: s.email, name: s.name,
    roleKey: s.roleKey, roleName: s.role?.name ?? s.roleKey,
    areas: safeArr(s.role?.areasJson), status: s.status, lastActiveAt: s.lastActiveAt,
    scopeCounties: safeArr(s.scopeCountiesJson), scopeCountries: safeArr(s.scopeCountriesJson),
  }));
}

/** Add or update a staff member's role/status. If no userId is supplied, the
 *  user is resolved by email — found if they already have a SIPlat account, or
 *  created with a temporary password so they can sign in to the staff portal. */
export async function upsertStaff(input: {
  userId?: string; email: string; name?: string; password?: string; roleKey: string; status?: string;
  scopeCounties?: string[]; scopeCountries?: string[]; actorUserId?: string | null;
}): Promise<{ id: string; userId: string; userCreated: boolean; passwordSet: boolean }> {
  await ensurePlatformRoles();
  const roleKeys = (await prisma.platformRole.findMany({ select: { key: true } })).map((r) => r.key);
  const check = validateStaff(input, roleKeys);
  if (!check.ok) throw new Error(check.reason);

  // Resolve the user this staff record belongs to. Prefer an explicit userId;
  // otherwise find-or-create by email so the super admin can onboard a brand-new
  // account manager (with a temporary password) without a pre-existing account.
  const email = input.email.toLowerCase().trim();
  let userId = (input.userId ?? "").trim();
  let userCreated = false;
  let passwordSet = false;
  if (!userId) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      userId = existing.id;
      if (input.name && !existing.fullName) await prisma.user.update({ where: { id: existing.id }, data: { fullName: input.name } });
      // Only (re)set the password for an existing user if one was explicitly supplied.
      if (input.password) { await prisma.user.update({ where: { id: existing.id }, data: { passwordHash: await hashPassword(input.password) } }); passwordSet = true; }
    } else {
      if (!input.password || input.password.length < 8) {
        throw new Error("Set a temporary password (at least 8 characters) so the new staff member can sign in.");
      }
      const created = await prisma.user.create({
        data: { email, fullName: input.name ?? null, passwordHash: await hashPassword(input.password), status: "active" },
      });
      userId = created.id; userCreated = true; passwordSet = true;
    }
  } else {
    // Explicit userId path: optionally (re)set a temporary password if supplied.
    if (input.password) { await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(input.password) } }); passwordSet = true; }
  }

  // Geo scope only applies to the Account Manager role; clear it for any other role.
  const geo = input.roleKey === "account_manager";
  const counties = geo ? normalizeScope(input.scopeCounties) : [];
  const countries = geo ? normalizeScope(input.scopeCountries) : [];
  const scope = { scopeCountiesJson: JSON.stringify(counties), scopeCountriesJson: JSON.stringify(countries) };
  const s = await prisma.platformStaff.upsert({
    where: { userId },
    update: { email, name: input.name ?? null, roleKey: input.roleKey, status: input.status ?? "active", ...scope },
    create: { userId, email, name: input.name ?? null, roleKey: input.roleKey, status: input.status ?? "active", invitedById: input.actorUserId ?? null, ...scope },
  });
  await recordAudit({ action: AUDIT.STAFF_UPDATED, actorUserId: input.actorUserId, targetType: "PlatformStaff", targetId: s.id, metadata: { roleKey: input.roleKey, status: input.status ?? "active", scopeCounties: counties, scopeCountries: countries, userCreated, passwordSet } });
  return { id: s.id, userId, userCreated, passwordSet };
}

export async function setStaffStatus(id: string, status: string, actor?: { userId?: string | null }): Promise<void> {
  const s = await prisma.platformStaff.update({ where: { id }, data: { status } });
  await recordAudit({ action: status === "suspended" ? AUDIT.STAFF_REMOVED : AUDIT.STAFF_UPDATED, actorUserId: actor?.userId, targetType: "PlatformStaff", targetId: s.id, metadata: { status } });
}

/** Resolve the areas a platform user may access (via their staff role). Platform
 *  super admins with no explicit staff record get full access. */
export async function staffAreas(userId: string, isPlatformAdmin: boolean): Promise<string[]> {
  const s = await prisma.platformStaff.findUnique({ where: { userId }, include: { role: true } });
  if (!s) return isPlatformAdmin ? ["*"] : [];
  if (s.status !== "active") return [];
  return normalizeAreas(safeArr(s.role?.areasJson));
}

export async function assertStaffArea(userId: string, isPlatformAdmin: boolean, area: string): Promise<void> {
  const areas = await staffAreas(userId, isPlatformAdmin);
  if (!canAccessArea(areas, area)) throw new Error(`No access to '${area}'`);
}

/** If this user is an active Account Manager, return their geographic portfolio
 *  scope; otherwise null (owners and other roles are not geo-restricted). */
export async function accountManagerScope(userId: string): Promise<{ counties: string[]; countries: string[] } | null> {
  const s = await prisma.platformStaff.findUnique({ where: { userId } });
  if (!s || s.status !== "active" || s.roleKey !== "account_manager") return null;
  return { counties: safeArr(s.scopeCountiesJson), countries: safeArr(s.scopeCountriesJson) };
}

/** The concrete set of school ids an Account Manager may access (their portfolio).
 *  Returns undefined for anyone who is NOT an active account manager — i.e. "not
 *  geo-restricted" (owners and other platform staff keep full access). An account
 *  manager whose scope matches nothing gets [] (fail-closed). Loaded into the auth
 *  context so tenant-access checks stay synchronous. */
export async function accountManagerScopedSchoolIds(userId: string): Promise<string[] | undefined> {
  const scope = await accountManagerScope(userId);
  if (!scope) return undefined;
  const schools = await prisma.school.findMany({ select: { id: true, county: true, country: true, accountManagerUserId: true } });
  // A school is in the portfolio if it's geographically covered OR explicitly
  // assigned to this account manager.
  return schools.filter((s) => s.accountManagerUserId === userId || managerCoversSchool(scope, s)).map((s) => s.id);
}

function safeArr(s?: string | null): string[] {
  if (!s) return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}
