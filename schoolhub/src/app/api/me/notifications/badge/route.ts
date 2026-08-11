import { requireAuth } from "@/lib/session";
import { badgeCount } from "@/lib/inbox";
import { handleError, ok } from "@/lib/http";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok({ unread: await badgeCount(ctx.userId) });
  } catch (err) { return handleError(err); }
}
