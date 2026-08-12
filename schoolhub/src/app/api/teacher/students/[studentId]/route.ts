import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { requireTeacherScope, assertTeacherStudent } from "@/lib/teacher";
import { handleError, ok } from "@/lib/http";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

type Params = { params: { studentId: string } };

// Full picture of ONE assigned pupil: profile, attendance, behaviour, reports,
// homework and trips. Access is denied if the pupil is outside the teacher's scope.
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const scope = await requireTeacherScope(ctx.userId, new URL(req.url).searchParams.get("school") || undefined);
    assertTeacherStudent(scope, params.studentId);
    const studentId = params.studentId;
    const now = new Date();
    const since = ymd(new Date(now.getTime() - 90 * 86400000));

    const [student, attendance, behaviour, reports, trips] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId }, include: { class: { select: { name: true } } } }),
      prisma.attendanceRecord.findMany({ where: { studentId, date: { gte: since } }, orderBy: { date: "desc" }, take: 90 }),
      prisma.rewardRecord.findMany({ where: { studentId }, orderBy: { at: "desc" }, take: 50 }),
      prisma.studentReport.findMany({ where: { schoolId: scope.schoolId, studentId }, orderBy: { updatedAt: "desc" }, take: 20 }),
      prisma.tripStudent.findMany({ where: { studentId, trip: { id: { in: scope.tripIds } } }, include: { trip: { select: { id: true, title: true, date: true, destination: true } } } }),
    ]);
    if (!student) return ok({ error: "Not found" }, 404);

    const cnt = (st: string) => attendance.filter((a) => a.status === st).length;
    const present = cnt("present"), late = cnt("late"), total = attendance.length;
    const rate = total ? Math.round(((present + late) / total) * 100) : null;

    return ok({
      student: {
        id: student.id, name: `${student.firstName} ${student.lastName}`.trim(), reference: student.reference,
        yearGroup: student.yearGroup, className: student.class?.name || null, house: student.house,
        dateOfBirth: student.dateOfBirth, photoUrl: student.photoUrl,
        medicalAlert: student.medicalAlert, allergies: student.allergies, sendIndicator: student.sendIndicator,
      },
      attendance: { summary: { rate, present, late, absent: cnt("unauthorised") + cnt("absent"), authorised: cnt("authorised"), total }, records: attendance.slice(0, 40).map((a) => ({ date: a.date, session: a.session, status: a.status, note: a.note })) },
      behaviour: behaviour.map((b) => ({ id: b.id, type: b.type, points: b.points, positive: b.positive, note: b.note, teacherName: b.teacherName, at: b.at })),
      reports: reports.map((r) => ({ id: r.id, title: r.title, term: r.term, status: r.status, updatedAt: r.updatedAt, authorMine: r.authorId === ctx.userId })),
      trips: trips.map((t) => ({ id: t.trip.id, title: t.trip.title, date: t.trip.date, destination: t.trip.destination, consent: t.consent })),
    });
  } catch (err) { return handleError(err); }
}
