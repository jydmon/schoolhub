import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { requireTeacherScope } from "@/lib/teacher";
import { handleError, ok } from "@/lib/http";

// GET — the signed-in teacher's own recent actions in this school.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const scope = await requireTeacherScope(ctx.userId, new URL(req.url).searchParams.get("school") || undefined);
    const rows = await prisma.auditLog.findMany({
      where: { actorUserId: ctx.userId, schoolId: scope.schoolId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok({
      entries: rows.map((a) => ({ id: a.id, at: a.createdAt, action: a.action, targetType: a.targetType, targetId: a.targetId })),
    });
  } catch (err) { return handleError(err); }
}
