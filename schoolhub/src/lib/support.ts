import { prisma } from "./db";
import { can, accessibleSchoolIds } from "./rbac";
import { PERMISSIONS } from "./constants";
import type { AuthContext } from "./session";

// Schools where the caller can triage/answer support tickets (school admins),
// plus a platform-admin catch-all handled by the caller.
export function manageableSchoolIds(ctx: AuthContext): string[] {
  return accessibleSchoolIds(ctx).filter((sid) => can(ctx, PERMISSIONS.MANAGE_USERS, sid));
}

export function canActOnTicket(ctx: AuthContext, ticket: { userId: string; schoolId: string | null }): boolean {
  if (ctx.isPlatformAdmin) return true;
  if (ticket.userId === ctx.userId) return true;
  return !!ticket.schoolId && can(ctx, PERMISSIONS.MANAGE_USERS, ticket.schoolId);
}

export function ticketPublic(t: any, messageCount?: number) {
  return {
    id: t.id, schoolId: t.schoolId, category: t.category, subject: t.subject,
    status: t.status, priority: t.priority, userName: t.userName, userEmail: t.userEmail,
    createdAt: t.createdAt, updatedAt: t.updatedAt, messages: messageCount,
  };
}
