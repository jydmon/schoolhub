import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { policyAckStatus } from "@/lib/policy-acks";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; pid: string } };
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_KNOWLEDGE, params.id);
    return ok(await policyAckStatus(params.pid));
  } catch (err) { return handleError(err); }
}
