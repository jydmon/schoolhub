import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { getChildren } from "@/lib/parent";
import { handleError, ok } from "@/lib/http";

// A parent's view of one child's weekly timetable (read-only), with teacher
// names resolved. Permission is implicit — only the parent's own children.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const children = await getChildren(ctx.userId);
    if (children.length === 0) return ok({ child: null, entries: [] });

    const wanted = new URL(req.url).searchParams.get("child");
    const c = (wanted && children.find((x) => x.student.id === wanted)) || children[0];
    const className = (c.student as any).class?.name || null;

    const entries = await prisma.timetableEntry.findMany({
      where: {
        schoolId: c.school.id,
        OR: [
          ...(c.student.yearGroup ? [{ yearGroup: c.student.yearGroup }] : []),
          ...(className ? [{ className }] : []),
          { AND: [{ yearGroup: null }, { className: null }] },
        ],
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    const teacherIds = Array.from(new Set(entries.map((e) => e.teacherUserId).filter(Boolean))) as string[];
    const teachers = teacherIds.length ? await prisma.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, fullName: true } }) : [];
    const nameById = new Map(teachers.map((t) => [t.id, t.fullName]));

    return ok({
      child: { id: c.student.id, name: `${c.student.firstName} ${c.student.lastName}`.trim(), yearGroup: c.student.yearGroup, className, schoolName: c.school.name },
      entries: entries.map((e) => ({ id: e.id, dayOfWeek: e.dayOfWeek, period: e.period, startTime: e.startTime, endTime: e.endTime, subject: e.subject, room: e.room, teacherName: e.teacherUserId ? (nameById.get(e.teacherUserId) || null) : null })),
    });
  } catch (err) { return handleError(err); }
}
