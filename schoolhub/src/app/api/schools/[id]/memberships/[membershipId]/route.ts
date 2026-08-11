import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, SCHOOL_ROLES } from "@/lib/constants";
import { setMembershipRole } from "@/lib/user-admin";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; membershipId: string } };

// Change the role on a membership (school administrator only, tenant-scoped).
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const body = await req.json().catch(() => ({}));
    const role = String(body?.role ?? "");
    if (!(SCHOOL_ROLES as readonly string[]).includes(role)) return ok({ error: "Unknown role" }, 400);
    const res = await setMembershipRole({ schoolId: params.id, membershipId: params.membershipId, role, actor: { userId: ctx.userId, email: ctx.email } });
    return ok(res);
  } catch (err) { return handleError(err); }
}
