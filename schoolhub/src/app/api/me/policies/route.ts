import { requireAuth } from "@/lib/session";
import { policiesForUser } from "@/lib/my-policies";
import { acknowledgePolicy } from "@/lib/policy-acks";
import { handleError, ok, AppError } from "@/lib/http";

// The signed-in user's applicable policies + their acknowledgement state.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const policies = await policiesForUser(ctx.userId);
    const outstandingMandatory = policies.filter((p) => p.mandatory && !p.acknowledged);
    return ok({ policies, outstandingMandatory: outstandingMandatory.length, outstanding: outstandingMandatory });
  } catch (err) { return handleError(err); }
}

// Acknowledge a policy at its current version (records user, policy, version, time).
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const policyId = String(b.policyId || "");
    if (!policyId) throw new AppError("policyId is required", 400);
    const role = ctx.memberships?.[0]?.role;
    const res = await acknowledgePolicy({ policyId, userId: ctx.userId, role });
    return ok(res, 201);
  } catch (err) { return handleError(err); }
}
