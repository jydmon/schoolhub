import { requireAuth } from "@/lib/session";
import { listManageable, createNotice, canManage } from "@/lib/notices";
import { recordAudit } from "@/lib/audit";
import { handleError, ok, AppError } from "@/lib/http";

// Announcement authoring. Super Administrators manage global (and any school)
// notices; School Administrators manage their own school's notices.
export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok({ items: await listManageable(ctx) });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const scope = b.scope === "global" ? "global" : "school";
    if (!b.title || !b.body) throw new AppError("Title and description are required.", 400);
    if (!canManage(ctx, scope, b.schoolId)) throw new AppError("You don't have permission to publish this announcement.", 403);
    const notice = await createNotice(ctx.userId, ctx.fullName, b);
    await recordAudit({ action: "ANNOUNCEMENT_PUBLISHED", actorUserId: ctx.userId, actorEmail: ctx.email, schoolId: notice.schoolId || undefined, targetType: "Notice", targetId: notice.id, metadata: { scope, priority: notice.priority } });
    return ok({ notice });
  } catch (err) { return handleError(err); }
}
