import { requireAuth } from "@/lib/session";
import { parentCalendarItems } from "@/lib/parent-calendar";
import { handleError, ok } from "@/lib/http";

// Consolidated calendar items for the signed-in parent across all their
// children and schools, between ?from and ?to (ISO dates). Permission is
// implicit: only the parent's own children's items are ever returned.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const sp = new URL(req.url).searchParams;
    const from = sp.get("from") ? new Date(sp.get("from")!) : new Date();
    const to = sp.get("to") ? new Date(sp.get("to")!) : new Date(from.getTime() + 42 * 86400000);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return ok({ items: [] });
    const items = await parentCalendarItems(ctx.userId, from, to);
    return ok({ items });
  } catch (err) { return handleError(err); }
}
