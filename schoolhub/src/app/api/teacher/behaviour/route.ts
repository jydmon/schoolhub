import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { requireTeacherScope, assertTeacherStudent } from "@/lib/teacher";
import { recordAudit } from "@/lib/audit";
import { handleError, ok, AppError } from "@/lib/http";

const NEGATIVE = new Set(["incident", "detention", "sanction"]);

// GET — recent behaviour records for the teacher's pupils.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const scope = await requireTeacherScope(ctx.userId, new URL(req.url).searchParams.get("school") || undefined);
    if (scope.studentIds.length === 0) return ok({ records: [] });
    const records = await prisma.rewardRecord.findMany({
      where: { studentId: { in: scope.studentIds } },
      include: { student: { select: { firstName: true, lastName: true } } },
      orderBy: { at: "desc" },
      take: 100,
    });
    return ok({
      records: records.map((r) => ({
        id: r.id, at: r.at, positive: r.positive, type: r.type, points: r.points,
        student: `${r.student?.firstName ?? ""} ${r.student?.lastName ?? ""}`.trim(),
        note: r.note,
      })),
    });
  } catch (err) { return handleError(err); }
}

// POST — log a merit/incident for one of the teacher's pupils.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const scope = await requireTeacherScope(ctx.userId, b.school || undefined);
    if (!b.studentId) throw new AppError("Choose a pupil.", 400);
    assertTeacherStudent(scope, String(b.studentId));
    const type = String(b.type || "merit");
    const positive = !NEGATIVE.has(type);
    const rec = await prisma.rewardRecord.create({
      data: {
        schoolId: scope.schoolId,
        studentId: String(b.studentId),
        type,
        points: Number.isFinite(Number(b.points)) ? Number(b.points) : 0,
        note: b.note ? String(b.note) : null,
        teacherName: ctx.fullName || ctx.email || null,
        positive,
        source: "Teacher portal",
      },
    });
    await recordAudit({ action: "BEHAVIOUR_LOGGED", schoolId: scope.schoolId, actorUserId: ctx.userId, targetType: "RewardRecord", targetId: rec.id, metadata: { type, positive } });
    return ok({ ok: true, id: rec.id }, 201);
  } catch (err) { return handleError(err); }
}
