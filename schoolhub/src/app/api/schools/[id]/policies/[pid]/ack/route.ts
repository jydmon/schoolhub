import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { acknowledgePolicy } from "@/lib/policy-acks";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; pid: string } };
// A parent/teacher acknowledges a policy (records the current version).
export async function POST(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    const roles = ctx.memberships.filter((m: any) => m.schoolId === params.id).map((m: any) => m.role);
    const res = await acknowledgePolicy({ policyId: params.pid, userId: ctx.userId, role: roles[0], schoolId: params.id });
    return ok(res, 201);
  } catch (err) { return handleError(err); }
}
