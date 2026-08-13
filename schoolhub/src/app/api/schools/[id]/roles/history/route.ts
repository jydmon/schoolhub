import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { roleHistory } from "@/lib/roles";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Role audit history for the Access Management module.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    return ok({ history: await roleHistory(params.id) });
  } catch (err) { return handleError(err); }
}
