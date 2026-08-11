import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { userActionSchema } from "@/lib/validation";
import { userAdminAction } from "@/lib/user-admin";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; userId: string } };

// Admin user controls: disable, suspend, reactivate, revoke access (all bump the
// session version to kill live sessions), or trigger a password reset.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const { action } = userActionSchema.parse(await req.json());
    const res = await userAdminAction({ schoolId: params.id, userId: params.userId, action, actor: { userId: ctx.userId, email: ctx.email } });
    return ok(res);
  } catch (err) { return handleError(err); }
}
