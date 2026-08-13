import {
  Permission,
  ROLE_PERMISSIONS,
  ROLES,
  PERMISSIONS,
} from "./constants";

export type MembershipLite = { schoolId: string; role: string };

export type AuthContext = {
  userId: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
  memberships: MembershipLite[];
  // Set only inside an approved support-access session (item 13): the platform
  // admin viewing this user's portal, and the request authorising it.
  impersonatorId?: string;
  impersonationRequestId?: string;
  // Item 12: effective permission keys per school, preloaded from tenant role
  // customizations. When present for a school, it overrides the built-in map.
  permsBySchool?: Record<string, string[]>;
};

/** Collect the permission set granted by a list of roles. */
export function permissionsForRoles(roles: string[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role] ?? []) set.add(p);
  }
  return set;
}

/** The roles this user holds within a given school. */
export function rolesInSchool(ctx: AuthContext, schoolId: string): string[] {
  return ctx.memberships.filter((m) => m.schoolId === schoolId).map((m) => m.role);
}

/** The set of schools this user belongs to (tenant scope). */
export function accessibleSchoolIds(ctx: AuthContext): string[] {
  return Array.from(new Set(ctx.memberships.map((m) => m.schoolId)));
}

/**
 * Capability check. Platform-level permissions require isPlatformAdmin.
 * School-scoped permissions require a matching role in that specific school —
 * this is the core of tenant isolation for the RBAC layer.
 */
export function can(ctx: AuthContext, permission: Permission, schoolId?: string): boolean {
  if (ctx.isPlatformAdmin) {
    // Super admin owns the platform plane. It does NOT implicitly grant
    // access to a specific tenant's operational data unless also a member,
    // except for platform-management and audit visibility.
    if (permission === PERMISSIONS.MANAGE_PLATFORM || permission === PERMISSIONS.VIEW_AUDIT) {
      return true;
    }
  }
  if (!schoolId) return false;
  const roles = rolesInSchool(ctx, schoolId);
  if (roles.length === 0) return false;
  // Item 12: if the session preloaded tenant-customized permissions for this
  // school, they are authoritative; otherwise fall back to the built-in map.
  const eff = ctx.permsBySchool?.[schoolId];
  if (eff) return eff.includes(permission);
  return permissionsForRoles(roles).has(permission);
}

export class PermissionError extends Error {
  status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "PermissionError";
  }
}

export function assertCan(ctx: AuthContext, permission: Permission, schoolId?: string): void {
  if (!can(ctx, permission, schoolId)) {
    throw new PermissionError(`Missing permission: ${permission}`);
  }
}

export function isMemberOf(ctx: AuthContext, schoolId: string): boolean {
  return ctx.isPlatformAdmin || ctx.memberships.some((m) => m.schoolId === schoolId);
}

export { ROLES, PERMISSIONS };
