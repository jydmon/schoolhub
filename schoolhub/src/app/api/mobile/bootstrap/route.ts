import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { ROLES } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

const STAFF: string[] = [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.TEACHER, ROLES.TRANSPORT_MANAGER, ROLES.SUPPORT_STAFF];

// Fast, role-aware initial payload for app start: identity, role, schools,
// children, unread count and feature flags — one round trip so the app renders
// its shell instantly, then lazy-loads each screen.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const roles = ctx.memberships.map((m) => m.role);
    const isDriver = roles.includes(ROLES.DRIVER);
    const isParent = roles.includes(ROLES.PARENT);
    const isStaff = roles.some((r) => STAFF.includes(r));
    const isAdmin = roles.includes(ROLES.SCHOOL_ADMIN) || roles.includes(ROLES.SCHOOL_LEADER) || ctx.isPlatformAdmin;

    // Pick the primary app for this user (a user may have several roles).
    const appRole = isDriver && !isStaff && !isParent ? "driver" : isAdmin ? "admin" : isStaff ? "teacher" : "parent";

    const children = await prisma.guardianLink.findMany({
      where: { parentUserId: ctx.userId },
      include: { student: { select: { id: true, firstName: true, lastName: true, yearGroup: true } } },
    });
    const unread = await prisma.notification.count({ where: { userId: ctx.userId, read: false } });

    return ok({
      user: { id: ctx.userId, email: ctx.email, name: ctx.fullName },
      appRole,
      roles,
      schools: Array.from(new Set(ctx.memberships.map((m) => m.schoolId))),
      children: children.map((c) => ({ id: c.student.id, name: `${c.student.firstName} ${c.student.lastName}`, yearGroup: c.student.yearGroup })),
      unreadNotifications: unread,
      features: { transport: true, trips: true, knowledge: true, ai: true, rewards: true, comms: true, biometric: true, offline: true },
      serverTime: new Date().toISOString(),
    });
  } catch (err) { return handleError(err); }
}
