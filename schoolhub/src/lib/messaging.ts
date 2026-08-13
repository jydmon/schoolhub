import { prisma } from "./db";
import { ROLES, ROLE_LABELS } from "./constants";
import { AppError } from "./http";

const STAFF_ROLES: string[] = [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.TEACHER, ROLES.TRANSPORT_MANAGER, ROLES.SUPPORT_STAFF, ROLES.INTEGRATION_ADMIN];
// Staff a parent may always reach (school-wide "authorised staff / office").
const PARENT_SCHOOL_STAFF: string[] = [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.TRANSPORT_MANAGER, ROLES.SUPPORT_STAFF];

// Per-school "allow parent↔parent messaging" flags (stored as PlatformSetting
// rows keyed messaging.p2p.<schoolId>). Off by default for safeguarding.
async function parentToParentSchools(schoolIds: string[]): Promise<Set<string>> {
  if (!schoolIds.length) return new Set();
  try {
    const rows = await prisma.platformSetting.findMany({ where: { key: { in: schoolIds.map((s) => `messaging.p2p.${s}`) } } });
    return new Set(rows.filter((r) => r.value === "true").map((r) => r.key.replace("messaging.p2p.", "")));
  } catch { return new Set(); }
}

// Every school a user belongs to — via staff/role membership OR as a guardian.
export async function userSchoolIds(userId: string): Promise<string[]> {
  const [ms, gl] = await Promise.all([
    prisma.membership.findMany({ where: { userId }, select: { schoolId: true } }),
    prisma.guardianLink.findMany({ where: { parentUserId: userId }, select: { schoolId: true } }),
  ]);
  return Array.from(new Set([...ms.map((m) => m.schoolId), ...gl.map((g) => g.schoolId)]));
}

// Safeguarding rule: a parent may only message staff LINKED to their child —
// the school office/administration (school-wide authorised staff), the child's
// class teachers, and the child's assigned transport drivers. Never other parents.
async function parentAllowedTargets(parentUserId: string): Promise<Set<string>> {
  const allowed = new Set<string>();
  const links = await prisma.guardianLink.findMany({
    where: { parentUserId },
    include: { student: { include: { class: { select: { name: true } }, transportProfile: { select: { routeId: true } } } } },
  });
  const schoolIds = Array.from(new Set(links.map((l) => l.student.schoolId)));
  const classNames = Array.from(new Set(links.map((l) => (l.student as any).class?.name).filter(Boolean))) as string[];
  const routeIds = Array.from(new Set(links.map((l) => (l.student as any).transportProfile?.routeId).filter(Boolean))) as string[];

  if (schoolIds.length) {
    const staff = await prisma.membership.findMany({ where: { schoolId: { in: schoolIds }, role: { in: PARENT_SCHOOL_STAFF } }, select: { userId: true } });
    staff.forEach((m) => allowed.add(m.userId));
  }
  // Child's class teachers (best-effort; degrade gracefully if the query shape differs).
  try {
    if (classNames.length) {
      const tes = await prisma.timetableEntry.findMany({ where: { schoolId: { in: schoolIds }, className: { in: classNames }, NOT: { teacherUserId: null } }, select: { teacherUserId: true } });
      tes.forEach((t) => { if (t.teacherUserId) allowed.add(t.teacherUserId); });
    }
  } catch { /* office staff still reachable */ }
  // Child's assigned drivers.
  try {
    if (routeIds.length) {
      const rds = await prisma.routeDriver.findMany({ where: { routeId: { in: routeIds } }, select: { driverUserId: true } });
      rds.forEach((r) => allowed.add(r.driverUserId));
    }
  } catch { /* ignore */ }
  return allowed;
}

// Build the messaging "community" for a user and apply the contact policy.
async function communityFor(userId: string) {
  const schoolIds = await userSchoolIds(userId);
  if (schoolIds.length === 0) return { schoolIds, senderStaff: false, candidates: new Map<string, { name: string; role: string; roleRaw: string; schoolId: string }>() };

  const memberships = await prisma.membership.findMany({ where: { schoolId: { in: schoolIds } }, include: { user: { select: { id: true, fullName: true, email: true } }, school: { select: { id: true, name: true } } } });
  const guardians = await prisma.guardianLink.findMany({ where: { schoolId: { in: schoolIds } }, select: { parentUserId: true, schoolId: true, parent: { select: { fullName: true, email: true } }, school: { select: { name: true } } } });

  const senderStaff = memberships.some((m) => m.user.id === userId && STAFF_ROLES.includes(m.role));
  const senderIsParent = guardians.some((g) => g.parentUserId === userId);

  const staffOf = new Set(memberships.filter((m) => STAFF_ROLES.includes(m.role)).map((m) => m.user.id));
  const candidates = new Map<string, { name: string; role: string; roleRaw: string; schoolId: string }>();
  for (const m of memberships) {
    if (m.user.id === userId) continue;
    if (!candidates.has(m.user.id)) candidates.set(m.user.id, { name: m.user.fullName || m.user.email, role: ROLE_LABELS[m.role] || m.role, roleRaw: m.role, schoolId: m.schoolId });
  }
  for (const g of guardians) {
    if (g.parentUserId === userId) continue;
    if (!candidates.has(g.parentUserId)) candidates.set(g.parentUserId, { name: g.parent?.fullName || g.parent?.email || "Parent", role: "Parent / Guardian", roleRaw: ROLES.PARENT, schoolId: g.schoolId });
  }

  if (senderStaff) {
    // Staff may reach everyone who shares a school (existing behaviour).
  } else if (senderIsParent) {
    // Parents: only staff linked to their child — plus other parents *only* in a
    // school that has explicitly enabled parent↔parent messaging.
    const allowed = await parentAllowedTargets(userId);
    const p2p = await parentToParentSchools(schoolIds);
    for (const [id, c] of candidates) {
      const permitted = allowed.has(id) || (c.roleRaw === ROLES.PARENT && p2p.has(c.schoolId));
      if (!permitted) candidates.delete(id);
    }
  } else {
    // Other non-staff (e.g. drivers): may reach staff only.
    for (const [id] of candidates) if (!staffOf.has(id)) candidates.delete(id);
  }
  return { schoolIds, senderStaff, candidates };
}

export async function messagingContacts(userId: string) {
  const { candidates } = await communityFor(userId);
  const schoolNames = new Map<string, string>();
  const sids = Array.from(new Set(Array.from(candidates.values()).map((c) => c.schoolId)));
  if (sids.length) { const schools = await prisma.school.findMany({ where: { id: { in: sids } }, select: { id: true, name: true } }); for (const s of schools) schoolNames.set(s.id, s.name); }
  return Array.from(candidates.entries()).map(([id, c]) => ({ id, name: c.name, role: c.role, schoolId: c.schoolId, schoolName: schoolNames.get(c.schoolId) || "" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function assertCanMessage(senderId: string, targetId: string) {
  if (senderId === targetId) throw new AppError("You can't message yourself.", 400);
  const { candidates } = await communityFor(senderId);
  if (!candidates.has(targetId)) throw new AppError("You're not allowed to message this person.", 403);
  return candidates.get(targetId)!.schoolId;
}

// Find the existing 1:1 thread between two users, or create it.
export async function findOrCreateDirectThread(schoolId: string, aId: string, bId: string) {
  const aThreads = await prisma.directThreadMember.findMany({ where: { userId: aId }, select: { threadId: true } });
  const ids = aThreads.map((t) => t.threadId);
  if (ids.length) {
    const shared = await prisma.directThread.findMany({ where: { id: { in: ids }, members: { some: { userId: bId } } }, include: { _count: { select: { members: true } } } });
    const oneToOne = shared.find((t) => t._count.members === 2);
    if (oneToOne) return oneToOne.id;
  }
  const thread = await prisma.directThread.create({ data: { schoolId, createdById: aId, members: { create: [{ userId: aId }, { userId: bId }] } } });
  return thread.id;
}

export function isStaffRole(role: string) { return STAFF_ROLES.includes(role); }
