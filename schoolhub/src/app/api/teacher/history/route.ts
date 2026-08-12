import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { requireTeacherScope } from "@/lib/teacher";
import { handleError, ok } from "@/lib/http";

// The teacher's own audit trail within their school.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const scope = await requireTeacherScope(ctx.userId, new URL(req.url).searchParams.get("school") || undefined);
    const entries = await prisma.auditLog.findMany({
      where: { schoolId: scope.schoolId, actorUserId: ctx.userId },
      orderBy: { createdAt: "desc" }, take: 200,
    });
    return ok({ entries: entries.map((a) => ({ id: a.id, action: a.action, targetType: a.targetType, targetId: a.targetId, at: a.createdAt, metadata: safe(a.metadata) })) });
  } catch (err) { return handleError(err); }
}

function safe(s: string) { try { return JSON.parse(s || "{}"); } catch { return {}; } }
