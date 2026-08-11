import { prisma } from "./db";
import { isMemberOf, AuthContext } from "./rbac";
import { PermissionError } from "./rbac";

/**
 * Tenant isolation guard. Every tenant-scoped operation must pass through here:
 * it verifies the caller belongs to (or is platform admin over) the school
 * before any tenant data is read or written. Combined with always filtering
 * queries by schoolId, this prevents cross-tenant data access.
 */
export function assertTenantAccess(ctx: AuthContext, schoolId: string): void {
  if (!isMemberOf(ctx, schoolId)) {
    throw new PermissionError("No access to this tenant");
  }
}

/** Load a school ensuring the caller may see it. Returns null if not found. */
export async function getTenantSchool(ctx: AuthContext, schoolId: string) {
  assertTenantAccess(ctx, schoolId);
  return prisma.school.findUnique({
    where: { id: schoolId },
    include: { config: true, subscription: { include: { plan: true } }, campuses: true },
  });
}

/** List memberships (users) for a school — always scoped by schoolId. */
export function listTenantMemberships(schoolId: string) {
  return prisma.membership.findMany({
    where: { schoolId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
}

/** List audit entries for a school — always scoped by schoolId. */
export function listTenantAudit(schoolId: string, take = 100) {
  return prisma.auditLog.findMany({
    where: { schoolId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
