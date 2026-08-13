import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { updateNotice, archiveNotice, canManage } from "@/lib/notices";
import { recordAudit } from "@/lib/audit";
import { handleError, ok, AppError } from "@/lib/http";

async function guard(userId: string, id: string) {
  const ctx = await requireAuth();
  const notice = await prisma.notice.findUnique({ where: { id } });
  if (!notice) throw new AppError("Announcement not found", 404);
  if (!canManage(ctx, notice.scope, notice.schoolId)) throw new AppError("Not permitted", 403);
  return { ctx, notice };
}

// Edit / publish / unpublish / archive an announcement.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { ctx, notice } = await guard("", params.id);
    const b = await req.json().catch(() => ({}));
    const updated = await updateNotice(notice.id, b);
    await recordAudit({ action: "ANNOUNCEMENT_UPDATED", actorUserId: ctx.userId, actorEmail: ctx.email, schoolId: notice.schoolId || undefined, targetType: "Notice", targetId: notice.id });
    return ok({ notice: updated });
  } catch (err) { return handleError(err); }
}

// Archive (soft) by default; ?hard=1 deletes permanently (Super Admin action).
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { ctx, notice } = await guard("", params.id);
    const hard = new URL(req.url).searchParams.get("hard") === "1";
    if (hard) {
      await prisma.noticeReceipt.deleteMany({ where: { noticeId: notice.id } });
      await prisma.notice.delete({ where: { id: notice.id } });
    } else {
      await archiveNotice(notice.id);
    }
    await recordAudit({ action: hard ? "ANNOUNCEMENT_DELETED" : "ANNOUNCEMENT_ARCHIVED", actorUserId: ctx.userId, actorEmail: ctx.email, schoolId: notice.schoolId || undefined, targetType: "Notice", targetId: notice.id });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
