import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { requireTeacherScope } from "@/lib/teacher";
import { handleError, ok } from "@/lib/http";

// GET — the teacher's weekly timetable (their own TimetableEntry rows).
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const scope = await requireTeacherScope(ctx.userId, new URL(req.url).searchParams.get("school") || undefined);
    const entries = await prisma.timetableEntry.findMany({
      where: { schoolId: scope.schoolId, teacherUserId: ctx.userId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    return ok({
      entries: entries.map((e) => ({
        id: e.id, dayOfWeek: e.dayOfWeek, startTime: e.startTime, endTime: e.endTime,
        subject: e.subject, className: e.className, yearGroup: e.yearGroup, room: e.room, period: e.period,
      })),
    });
  } catch (err) { return handleError(err); }
}
