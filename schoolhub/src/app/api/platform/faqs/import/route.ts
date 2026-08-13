import { requirePlatformAdmin } from "@/lib/session";
import { parseFaqRows, bulkImport } from "@/lib/faqs";
import { recordAudit } from "@/lib/audit";
import { handleError, ok, AppError } from "@/lib/http";

// Bulk-import FAQs. Body: { items: [{question, answer, category?, status?}] }
// OR { csv: "question,answer,category,status\n..." }.
export async function POST(req: Request) {
  try {
    const ctx = await requirePlatformAdmin();
    const b = await req.json().catch(() => ({}));
    const rows = parseFaqRows(b);
    if (!rows.length) throw new AppError("No valid FAQ rows found. Provide items[] or a CSV with question and answer columns.", 400);
    const res = await bulkImport(ctx.userId, rows);
    await recordAudit({ action: "FAQ_IMPORTED", actorUserId: ctx.userId, actorEmail: ctx.email, metadata: { created: res.created } });
    return ok({ ...res, total: rows.length });
  } catch (err) { return handleError(err); }
}
