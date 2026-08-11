import type { AuthContext } from "@/lib/session";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PermissionError } from "@/lib/rbac";

/**
 * Resolve the CRM scope from a request. A ?school=<id> param scopes the CRM to
 * that tenant (school admin with MANAGE_CRM). No param means the platform-wide
 * CRM, which only a platform super-admin may use.
 */
export function crmScope(ctx: AuthContext, req: Request): string | null {
  const schoolId = new URL(req.url).searchParams.get("school");
  if (schoolId) {
    assertCan(ctx, PERMISSIONS.MANAGE_CRM, schoolId);
    return schoolId;
  }
  if (!ctx.isPlatformAdmin) throw new PermissionError("Platform administrator required for platform-wide CRM");
  return null;
}
