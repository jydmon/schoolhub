import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { subApprovalSchema } from "@/lib/validation";
import { subscriptionReport, setApprovalMode, decideApproval } from "@/lib/subscriptions-admin";
import { handleError, ok, AppError } from "@/lib/http";

// Subscription reporting dashboard + manual-approval override.
export async function GET() {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "subscriptions");
    return ok(await subscriptionReport());
  } catch (err) { return handleError(err); }
}
// Body: { type, action, mode?, id }  (id in query ?id=)
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "subscriptions");
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new AppError("id required", 400);
    const body = subApprovalSchema.parse(await req.json());
    const actor = { userId: ctx.userId };
    if (body.action === "set_mode") {
      if (!body.mode) throw new AppError("mode required", 400);
      await setApprovalMode(body.type, id, body.mode, actor);
    } else {
      await decideApproval(body.type, id, body.action === "approve" ? "approved" : "rejected", actor);
    }
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
