import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { requireTeacherScope } from "@/lib/teacher";
import { handleError, ok } from "@/lib/http";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Everything the teacher dashboard needs in one call, strictly scoped.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const scope = await requireTeacherScope(ctx.userId, new URL(req.url).searchParams.get("school") || undefined);
    const now = new Date();
    const today = ymd(now);
    const dow = ((now.getDay() + 6) % 7) + 1;
    const sid = scope.schoolId;

    const [lessons, events, trips, reportsDraft, recentBehaviour, homework, attendanceToday] = await Promise.all([
      prisma.timetableEntry.findMany({ where: { schoolId: sid, teacherUserId: ctx.userId, dayOfWeek: dow }, orderBy: { startTime: "asc" } }),
      prisma.calendarEvent.findMany({ where: { schoolId: sid, status: { not: "cancelled" }, startsAt: { gte: now, lte: new Date(now.getTime() + 14 * 86400000) } }, orderBy: { startsAt: "asc" }, take: 8 }),
      scope.tripIds.length ? prisma.trip.findMany({ where: { id: { in: scope.tripIds } }, orderBy: { date: "asc" }, take: 8 }) : [],
      scope.studentIds.length ? prisma.studentReport.findMany({ where: { schoolId: sid, studentId: { in: scope.studentIds }, authorId: ctx.userId, status: { in: ["draft", "submitted"] } }, include: { student: { select: { firstName: true, lastName: true } } }, orderBy: { updatedAt: "desc" }, take: 8 }) : [],
      scope.studentIds.length ? prisma.rewardRecord.findMany({ where: { studentId: { in: scope.studentIds } }, include: { student: { select: { firstName: true, lastName: true } } }, orderBy: { at: "desc" }, take: 8 }) : [],
      prisma.homework.findMany({ where: { schoolId: sid, dueAt: { gte: now, lte: new Date(now.getTime() + 7 * 86400000) }, ...(scope.classIds.length || scope.yearGroups.length ? { OR: [{ classId: { in: scope.classIds } }, { yearGroup: { in: scope.yearGroups } }] } : {}) }, orderBy: { dueAt: "asc" }, take: 8 }),
      scope.studentIds.length ? prisma.attendanceRecord.count({ where: { studentId: { in: scope.studentIds }, date: today } }) : 0,
    ]);

    // Behaviour tally over last 30 days for assigned students.
    const since = new Date(now.getTime() - 30 * 86400000);
    const bAgg = scope.studentIds.length ? await prisma.rewardRecord.findMany({ where: { studentId: { in: scope.studentIds }, at: { gte: since } }, select: { positive: true, points: true } }) : [];
    const positivePoints = bAgg.filter((b) => b.positive).reduce((s, b) => s + (b.points || 0), 0);
    const negativeCount = bAgg.filter((b) => !b.positive).length;

    return ok({
      scope: { schoolName: scope.schoolName, classes: scope.classNames, subjects: scope.subjects, studentCount: scope.studentIds.length },
      today,
      lessons: lessons.map((l) => ({ id: l.id, subject: l.subject, startTime: l.startTime, endTime: l.endTime, className: l.className, yearGroup: l.yearGroup, room: l.room, period: l.period })),
      events: events.map((e) => ({ id: e.id, title: e.title, category: e.category, startsAt: e.startsAt, location: e.location })),
      trips: trips.map((t) => ({ id: t.id, title: t.title, date: t.date, destination: t.destination })),
      reportsToWrite: reportsDraft.map((r) => ({ id: r.id, title: r.title, status: r.status, student: `${r.student.firstName} ${r.student.lastName}` })),
      recentBehaviour: recentBehaviour.map((b) => ({ id: b.id, type: b.type, positive: b.positive, points: b.points, student: `${b.student.firstName} ${b.student.lastName}`, at: b.at })),
      homework: homework.map((h) => ({ id: h.id, title: h.title, subject: h.subject, dueAt: h.dueAt })),
      stats: { students: scope.studentIds.length, classes: scope.classNames.length, lessonsToday: lessons.length, attendanceTakenToday: attendanceToday, positivePoints, negativeCount, reportsOutstanding: reportsDraft.length },
    });
  } catch (err) { return handleError(err); }
}
