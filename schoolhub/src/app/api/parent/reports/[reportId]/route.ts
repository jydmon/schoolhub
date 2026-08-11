import { requireAuth } from "@/lib/session";
import { parentReportDetail } from "@/lib/reports-release";
import { handleError, ok } from "@/lib/http";

type Params = { params: { reportId: string } };

// A single report for a parent. Enforces guardianship + visibility and records
// a first-view read receipt. 403 if not this parent's child or still embargoed.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const report = await parentReportDetail(ctx.userId, params.reportId, ctx.email, new Date());
    return ok({ report });
  } catch (err) { return handleError(err); }
}
