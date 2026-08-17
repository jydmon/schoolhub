import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { requireTeacherScope, assertTeacherStudent } from "@/lib/teacher";
import { studentAttendanceBreakdown } from "@/lib/attendance";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// A single pupil's record for a teacher: profile + attendance (summary +
// history), behaviour, reports and the teacher's trips the pupil is on. The
// pupil must be within the teacher's scope.
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const scope = await requireTeacherScope(ctx.userId, new URL(req.url).searchParams.get("school") || undefined);
    assertTeacherStudent(scope, params.id);

    const [student, attendance, behaviour, reports, tripLinks] = await Promise.all([
      prisma.student.findUnique({
        where: { id: params.id },
        select: { firstName: true, lastName: true, reference: true, yearGroup: true, house: true, medicalAlert: true, sendIndicator: true, allergies: true, class: { select: { name: true } } },
      }),
      studentAttendanceBreakdown(params.id),
      prisma.rewardRecord.findMany({ where: { studentId: params.id }, orderBy: { at: "desc" }, take: 50 }),
      prisma.studentReport.findMany({ where: { schoolId: scope.schoolId, studentId: params.id }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, title: true, term: true, status: true } }),
      scope.tripIds.length
        ? prisma.tripStudent.findMany({ where: { studentId: params.id, tripId: { in: scope.tripIds } }, include: { trip: { select: { id: true, title: true, date: true, destination: true } } } })
        : [],
    ]);

    if (!student) return ok({ error: "Pupil not found." });

    return ok({
      student: {
        name: `${student.firstName} ${student.lastName}`.trim(),
        reference: student.reference,
        yearGroup: student.yearGroup,
        className: student.class?.name ?? null,
        house: student.house,
        medicalAlert: student.medicalAlert,
        sendIndicator: student.sendIndicator,
        allergies: student.allergies,
      },
      attendance,
      behaviour: behaviour.map((b) => ({ id: b.id, positive: b.positive, type: b.type, points: b.points, teacherName: b.teacherName, at: b.at, note: b.note })),
      reports: reports.map((r) => ({ id: r.id, title: r.title, term: r.term, status: r.status })),
      trips: tripLinks.map((t) => ({ id: t.trip.id, title: t.trip.title, date: t.trip.date, destination: t.trip.destination, consent: t.consent })),
    });
  } catch (err) { return handleError(err); }
}
