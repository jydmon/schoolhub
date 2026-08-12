import { prisma } from "./db";
import { ROLES, ROLE_LABELS } from "./constants";
import { AppError } from "./http";

const STAFF_ROLES: string[] = [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.TEACHER, ROLES.TRANSPORT_MANAGER, ROLES.SUPPORT_STAFF, ROLES.INTEGRATION_ADMIN];

// Every school a user belongs to — via staff/role membership OR as a guardian.
export async function userSchoolIds(userId: string): Promise<string[]> {
  const [ms, gl] = await Promise.all([
    prisma.membership.findMany({ where: { userId }, select: { schoolId: true } }),
    prisma.guardianLink.findMany({ where: { parentUserId: userId }, select: { schoolId: true } }),
  ]);
  return Array.from(new Set([...ms.map((m) => m.schoolId), ...gl.map((g) => g.schoolId)]));
}

type Profile = { schoolIds: string[]; staff: boolean; roleLabels: Map<string, string>; names: Map<string, string> };

// Build the messaging "community" for a user: who shares a school with them and,
// under the same-school + role policy, whom they're allowed to contact.
async function communityFor(userId: string) {
  const schoolIds = await userSchoolIds(userId);
  if (schoolIds.length === 0) return { schoolIds, senderStaff: false, candidates: new Map<string, { name: string; role: string; roleRaw: string; schoolId: string }>() };

  const memberships = await prisma.membership.findMany({ where: { schoolId: { in: schoolIds } }, include: { user: { select: { id: true, fullName: true, email: true } }, school: { select: { id: true, name: true } } } });
  const guardians = await prisma.guardianLink.findMany({ where: { schoolId: { in: schoolIds } }, select: { parentUserId: true, schoolId: true, parent: { select: { fullName: true, email: true } }, school: { select: { name: true } } } });

  const senderStaff = memberships.some((m) => m.user.id === userId && STAFF_ROLES.includes(m.role));

  // Whether each user is staff somewhere in the shared schools.
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
  // Policy: allow a pair only if at least one side is staff (prevents parent↔parent
  // / driver↔driver noise; lets parents & drivers reach staff, and staff reach all).
  for (const [id] of candidates) {
    const otherStaff = staffOf.has(id);
    if (!senderStaff && !otherStaff) candidates.delete(id);
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
