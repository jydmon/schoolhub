import { requireAuth } from "@/lib/session";
import { getInbox, markRead, markAllRead } from "@/lib/inbox";
import { handleError, ok } from "@/lib/http";

// The signed-in user's notification inbox ("What's new"): in-app feed + unread
// badge count + per-kind summary. Works for any role.
export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok(await getInbox(ctx.userId));
  } catch (err) { return handleError(err); }
}

// Mark notifications read. Body: { ids?: string[], all?: boolean }.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const res = body?.all ? await markAllRead(ctx.userId) : await markRead(ctx.userId, Array.isArray(body?.ids) ? body.ids : undefined);
    return ok(res);
  } catch (err) { return handleError(err); }
}
