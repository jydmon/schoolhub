import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { buildReport, reportToCsv, reportToPdf, reportToXls } from "@/lib/reports";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; type: string } };

// Generate a live school report. Returns JSON by default; ?format=csv|xlsx|pdf
// streams a downloadable file. Tenant-scoped, requires report-viewing rights.
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_REPORTS, params.id);

    const format = new URL(req.url).searchParams.get("format");
    const report = await buildReport(params.id, params.type);
    const base = `report-${params.type}`;

    if (format === "csv") {
      return new Response(reportToCsv(report), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` },
      });
    }
    if (format === "xlsx" || format === "xls" || format === "excel") {
      return new Response(reportToXls(report), {
        headers: { "Content-Type": "application/vnd.ms-excel", "Content-Disposition": `attachment; filename="${base}.xls"` },
      });
    }
    if (format === "pdf") {
      return new Response(reportToPdf(report), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${base}.pdf"` },
      });
    }
    return ok({ report });
  } catch (err) { return handleError(err); }
}
