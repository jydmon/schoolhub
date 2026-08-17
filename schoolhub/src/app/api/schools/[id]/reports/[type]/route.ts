import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { buildReport, reportToCsv, reportToParagraphs, reportSheets } from "@/lib/reports";
import { recordDownload, brandedPdf, csvWithMetadata, xlsMetaSheet } from "@/lib/download";
import { sheetsToXls } from "@/lib/xls";
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

    // File exports run through download governance: each records an audit row
    // and carries the standard metadata (CSV header block / Excel "Download
    // info" sheet / branded PDF letterhead + footer + audit reference).
    if (format === "csv") {
      const dmeta = await recordDownload(ctx, { section: "Reports", reportName: report.title, format: "csv", schoolId: params.id });
      return new Response(csvWithMetadata(dmeta, reportToCsv(report)), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` },
      });
    }
    if (format === "xlsx" || format === "xls" || format === "excel") {
      const dmeta = await recordDownload(ctx, { section: "Reports", reportName: report.title, format: "xls", schoolId: params.id });
      return new Response(new Uint8Array(sheetsToXls([xlsMetaSheet(dmeta), ...reportSheets(report)])), {
        headers: { "Content-Type": "application/vnd.ms-excel", "Content-Disposition": `attachment; filename="${base}.xls"` },
      });
    }
    if (format === "pdf") {
      const dmeta = await recordDownload(ctx, { section: "Reports", reportName: report.title, format: "pdf", schoolId: params.id });
      return new Response(new Uint8Array(brandedPdf(dmeta, report.title, reportToParagraphs(report))), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${base}.pdf"` },
      });
    }
    return ok({ report });
  } catch (err) { return handleError(err); }
}
