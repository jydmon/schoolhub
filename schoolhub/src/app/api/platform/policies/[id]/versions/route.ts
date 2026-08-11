import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { listPolicyVersions, restorePolicyVersion } from "@/lib/policies";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string } };

// Version history for a policy.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "policies");
    return ok({ versions: await listPolicyVersions(params.id) });
  } catch (err) { return handleError(err); }
}

// Restore a prior version onto the live policy.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "policies");
    const body = await req.json().catch(() => ({}));
    if (!body?.versionId) throw new AppError("versionId required", 400);
    await restorePolicyVersion(params.id, String(body.versionId), { userId: ctx.userId });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
