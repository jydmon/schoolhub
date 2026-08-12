import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { recordAudit } from "@/lib/audit";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string; reportId: string } };

// Edit a single pupil report. API-sourced reports are read-only; manual/imported
// reports may be edited (title/term/summary/status).
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.AUTHOR_REPORTS, params.id);

    const report = await prisma.studentReport.findUnique({ where: { id: params.reportId } });
    if (!report || report.schoolId !== params.id) throw new AppError("Report not found", 404);
    if (((report as any).source ?? "manual") === "api") throw new AppError("API-sourced reports are read-only", 403);

    const b = await req.json().catch(() => ({}));
    const data: any = {};
    if (typeof b.title === "string") data.title = b.title.trim();
    if (typeof b.term === "string") data.term = b.term.trim() || null;
    if (typeof b.summary === "string") data.summary = b.summary.trim() || null;
    if (typeof b.type === "string") data.type = b.type.trim();
    if (typeof b.status === "string" && ["draft", "submitted", "approved", "released", "withdrawn"].includes(b.status)) data.status = b.status;
    if (!Object.keys(data).length) return ok({ ok: true });

    await prisma.studentReport.update({ where: { id: params.reportId }, data });
    await recordAudit({ action: "REPORT_UPDATED", schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "StudentReport", targetId: params.reportId, metadata: { updated: Object.keys(data) } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}

// Delete a manual/imported pupil report (API reports cannot be deleted here).
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.AUTHOR_REPORTS, params.id);
    const report = await prisma.studentReport.findUnique({ where: { id: params.reportId } });
    if (!report || report.schoolId !== params.id) throw new AppError("Report not found", 404);
    if (((report as any).source ?? "manual") === "api") throw new AppError("API-sourced reports are read-only", 403);
    await prisma.studentReport.delete({ where: { id: params.reportId } });
    await recordAudit({ action: "REPORT_REMOVED", schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "StudentReport", targetId: params.reportId });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
