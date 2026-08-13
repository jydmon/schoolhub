import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { ROLES } from "@/lib/constants";
import { getSecurityPolicy, passwordExpiry } from "@/lib/security-policy";
import { handleError, ok } from "@/lib/http";

const STAFF: string[] = [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.TEACHER, ROLES.TRANSPORT_MANAGER, ROLES.SUPPORT_STAFF];

// Fast, role-aware initial payload for app start: identity, role, schools,
// children, unread count, security posture and feature flags.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const roles = ctx.memberships.map((m) => m.role);
    const isDriver = roles.includes(ROLES.DRIVER);
    const isParent = roles.includes(ROLES.PARENT);
    const isStaff = roles.some((r) => STAFF.includes(r));
    const isAdmin = roles.includes(ROLES.SCHOOL_ADMIN) || roles.includes(ROLES.SCHOOL_LEADER) || ctx.isPlatformAdmin;

    const appRole = isDriver && !isStaff && !isParent ? "driver" : isAdmin ? "admin" : isStaff ? "teacher" : "parent";

    const [children, unread, user, policy] = await Promise.all([
      prisma.guardianLink.findMany({
        where: { parentUserId: ctx.userId },
        include: { student: { select: { id: true, firstName: true, lastName: true, yearGroup: true } } },
      }),
      prisma.notification.count({ where: { userId: ctx.userId, read: false } }),
      prisma.user.findUnique({ where: { id: ctx.userId }, select: { mfaEnabled: true, mustChangePassword: true, passwordChangedAt: true } }),
      getSecurityPolicy(),
    ]);

    const exp = passwordExpiry(user?.passwordChangedAt ?? null, policy);

    return ok({
      user: { id: ctx.userId, email: ctx.email, name: ctx.fullName },
      appRole,
      roles,
      schools: Array.from(new Set(ctx.memberships.map((m) => m.schoolId))),
      children: children.map((c) => ({ id: c.student.id, name: `${c.student.firstName} ${c.student.lastName}`, yearGroup: c.student.yearGroup })),
      unreadNotifications: unread,
      // Security posture — lets the app gate MFA enrolment / password change.
      security: {
        mfaEnabled: !!user?.mfaEnabled,
        mfaRequired: policy.mfaRequired,
        mfaEnrollmentRequired: policy.mfaRequired && !user?.mfaEnabled,
        passwordExpired: exp.expired,
        passwordDaysLeft: exp.daysLeft,
        mustChangePassword: user?.mustChangePassword || (exp.expired && !exp.canDefer),
      },
      features: { transport: true, trips: true, knowledge: true, ai: true, rewards: true, comms: true, biometric: true, offline: true },
      serverTime: new Date().toISOString(),
    });
  } catch (err) { return handleError(err); }
}
