import { requireAuth } from "@/lib/session";
import { parentReports } from "@/lib/reports-release";
import { handleError, ok } from "@/lib/http";

// Released reports across all of a parent's children (embargoed reports excluded).
export async function GET() {
  try {
    const ctx = await requireAuth();
    const reports = await parentReports(ctx.userId, new Date());
    return ok({ reports });
  } catch (err) { return handleError(err); }
}
