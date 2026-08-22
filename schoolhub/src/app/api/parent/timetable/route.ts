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

    // Match the child's timetable case/whitespace-insensitively. A common reason
    // "no timetable" showed even when one was imported is a formatting mismatch
    // between the imported rows (e.g. "Year 6") and the student record ("year 6"
    // / " Year 6 "). We fetch the school's entries and filter in-app on a
    // normalised comparison, still strictly scoped to this child's own year/class
    // (or whole-school entries with neither set).
    const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
    const yg = norm(c.student.yearGroup);
    const cn = norm(className);
    const all = await prisma.timetableEntry.findMany({
      where: { schoolId: c.school.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    const entries = all.filter((e) => {
      const eyg = norm(e.yearGroup);
      const ecn = norm(e.className);
      if (!eyg && !ecn) return true;                 // whole-school slot
      if (eyg && yg && eyg === yg) return true;       // matches the child's year
      if (ecn && cn && ecn === cn) return true;       // matches the child's class
      return false;
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
