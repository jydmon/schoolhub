import { requireAuth } from "@/lib/session";
import { recordDownload, metadataPairs } from "@/lib/download";
import { handleError, ok } from "@/lib/http";

// Client-side exports (browser Blob CSVs) call this to be recorded in the
// download audit trail and to receive the standardised metadata block to prepend
// to the file, so they carry the same governance as server-streamed exports.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const format = (["pdf", "xls", "csv"].includes(b.format) ? b.format : "csv") as "pdf" | "xls" | "csv";
    const meta = await recordDownload(ctx, {
      section: String(b.section || "Export").slice(0, 80),
      reportName: String(b.reportName || "Export").slice(0, 120),
      format,
      schoolId: b.schoolId ? String(b.schoolId) : null,
    });
    return ok({ reference: meta.reference, pairs: metadataPairs(meta) });
  } catch (err) { return handleError(err); }
}
