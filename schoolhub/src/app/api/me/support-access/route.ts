import { requireAuth } from "@/lib/session";
import { listForUser, respond } from "@/lib/support-access";
import { handleError, ok, AppError } from "@/lib/http";

// The target user's view: pending requests to action + history; and approve/
// reject/revoke. Works on web and mobile.
export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok(await listForUser(ctx.userId));
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || "");
    if (!b.id || !["approve", "reject", "revoke"].includes(action)) throw new AppError("A request id and a valid action are required.", 400);
    const request = await respond(ctx.userId, String(b.id), action as any);
    return ok({ request });
  } catch (err) { return handleError(err); }
}
