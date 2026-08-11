import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { buildReport, reportToCsv, reportToPdf } from "@/lib/reports";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";
import { NextResponse } from "next/server";

type Params = { params: { id: string; type: string } };

// Report as JSON, or as a CSV/PDF download (?format=csv|pdf).
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_REPORTS, params.id);
    const format = new URL(req.url).searchParams.get("format");
    const report = await buildReport(params.id, params.type);

    if (format === "csv") {
      await recordAudit({ action: AUDIT.REPORT_RUN, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, metadata: { type: params.type, format } });
      return new NextResponse(reportToCsv(report), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${params.type}-report.csv"` } });
    }
    if (format === "pdf") {
      await recordAudit({ action: AUDIT.REPORT_RUN, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, metadata: { type: params.type, format } });
      const pdf = reportToPdf(report);
      return new NextResponse(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${params.type}-report.pdf"` } });
    }
    return ok({ report });
  } catch (err) { return handleError(err); }
}
