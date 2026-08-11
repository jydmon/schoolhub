import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { policySchema } from "@/lib/validation";
import { listPolicies, createPolicy } from "@/lib/policies";
import { viewerPoliciesWithAck } from "@/lib/policy-acks";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    const viewer = new URL(req.url).searchParams.get("viewer"); // parents | teachers
    if (viewer === "parents" || viewer === "teachers") {
      // Annotated with the viewer's acknowledgement state.
      const roles = ctx.memberships.filter((m: any) => m.schoolId === params.id).map((m: any) => m.role);
      return ok({ policies: await viewerPoliciesWithAck(params.id, { userId: ctx.userId, roles }) });
    }
    assertCan(ctx, PERMISSIONS.MANAGE_KNOWLEDGE, params.id);
    return ok({ policies: await listPolicies({ schoolId: params.id, adminAll: true }) });
  } catch (err) { return handleError(err); }
}
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_KNOWLEDGE, params.id);
    const body = policySchema.parse(await req.json());
    return ok(await createPolicy({ ...body, schoolId: params.id, actorUserId: ctx.userId }), 201);
  } catch (err) { return handleError(err); }
}
