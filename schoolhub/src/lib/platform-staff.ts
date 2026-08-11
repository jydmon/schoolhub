import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";
import { PLATFORM_ROLES, validateStaff, normalizeAreas, canAccessArea } from "./platform-staff-logic";

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
  }));
}

/** Add or update a staff member's role/status. */
export async function upsertStaff(input: {
  userId: string; email: string; name?: string; roleKey: string; status?: string; actorUserId?: string | null;
}): Promise<{ id: string }> {
  await ensurePlatformRoles();
  const roleKeys = (await prisma.platformRole.findMany({ select: { key: true } })).map((r) => r.key);
  const check = validateStaff(input, roleKeys);
  if (!check.ok) throw new Error(check.reason);
  const s = await prisma.platformStaff.upsert({
    where: { userId: input.userId },
    update: { email: input.email, name: input.name ?? null, roleKey: input.roleKey, status: input.status ?? "active" },
    create: { userId: input.userId, email: input.email, name: input.name ?? null, roleKey: input.roleKey, status: input.status ?? "active", invitedById: input.actorUserId ?? null },
  });
  await recordAudit({ action: AUDIT.STAFF_UPDATED, actorUserId: input.actorUserId, targetType: "PlatformStaff", targetId: s.id, metadata: { roleKey: input.roleKey, status: input.status ?? "active" } });
  return { id: s.id };
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

function safeArr(s?: string | null): string[] {
  if (!s) return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}
