import { requirePlatformAdmin } from "@/lib/session";
import { createRequest, listForAdmin } from "@/lib/support-access";
import { handleError, ok } from "@/lib/http";

// Super-Admin support access: list my requests + raise a new one.
export async function GET() {
  try {
    const ctx = await requirePlatformAdmin();
    return ok({ requests: await listForAdmin(ctx.userId) });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePlatformAdmin();
    const b = await req.json().catch(() => ({}));
    const request = await createRequest(ctx, { targetEmail: b.targetEmail, targetUserId: b.targetUserId, reason: b.reason, durationMins: b.durationMins });
    return ok({ request }, 201);
  } catch (err) { return handleError(err); }
}
