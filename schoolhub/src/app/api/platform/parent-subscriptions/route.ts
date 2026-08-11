import { requireAuth, requirePlatformAdmin } from "@/lib/session";
import { parentSubSchema } from "@/lib/validation";
import { platformParentSubSummary, upsertParentSubscription } from "@/lib/parent-subscriptions";
import { handleError, ok } from "@/lib/http";

// Super-admin dashboard tracking for parent premium subscriptions:
// active/trialing counts, MRR/ARR/ARPU, and a per-school league table.
export async function GET() {
  try {
    await requirePlatformAdmin();
    return ok(await platformParentSubSummary());
  } catch (err) { return handleError(err); }
}

// Upsert a parent subscription (e.g. from a Stripe webhook or admin action).
// Only opaque Stripe references are accepted — never card data.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    if (!ctx.isPlatformAdmin) { await requirePlatformAdmin(); }
    const body = parentSubSchema.parse(await req.json());
    const res = await upsertParentSubscription({ ...body, actorUserId: ctx.userId });
    return ok(res, 201);
  } catch (err) { return handleError(err); }
}
