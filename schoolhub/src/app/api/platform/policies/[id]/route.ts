import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { policySchema } from "@/lib/validation";
import { updatePolicy, setPolicyPublished, setPolicyStatus, deletePolicy } from "@/lib/policies";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Edit a platform policy, or change its lifecycle status (draft/approved/published).
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "policies");
    const raw = await req.json();
    // Fast path: status change only.
    if (raw && typeof raw.status === "string" && Object.keys(raw).length === 1) {
      await setPolicyStatus(params.id, raw.status, { userId: ctx.userId });
      return ok({ ok: true });
    }
    // Fast path: publish/unpublish only.
    if (raw && typeof raw.published === "boolean" && Object.keys(raw).length === 1) {
      await setPolicyPublished(params.id, raw.published, { userId: ctx.userId });
      return ok({ ok: true });
    }
    const body = policySchema.partial().parse(raw);
    await updatePolicy(params.id, body, { userId: ctx.userId });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "policies");
    await deletePolicy(params.id, { userId: ctx.userId });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
