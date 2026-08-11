import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { policySchema } from "@/lib/validation";
import { listPolicies, createPolicy } from "@/lib/policies";
import { handleError, ok } from "@/lib/http";

export async function GET() {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "policies");
    return ok({ policies: await listPolicies({ schoolId: null, adminAll: true }) });
  } catch (err) { return handleError(err); }
}
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "policies");
    const body = policySchema.parse(await req.json());
    return ok(await createPolicy({ ...body, schoolId: null, actorUserId: ctx.userId }), 201);
  } catch (err) { return handleError(err); }
}
