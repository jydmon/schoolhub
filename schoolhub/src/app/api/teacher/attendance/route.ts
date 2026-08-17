import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { requireTeacherScope, assertTeacherStudent } from "@/lib/teacher";
import { listAttendance, attendanceSummary, upsertAttendance } from "@/lib/attendance";
import { handleError, ok, AppError } from "@/lib/http";

const today = () => new Date().toISOString().slice(0, 10);

// GET — two modes, both strictly scoped to the teacher's pupils:
//   default (register): ?date=&session=&class= → roster of the teacher's pupils
//     with any existing mark for that date+session, ready to mark.
//   ?view=records&from=&to=&status=&session=&student= → filtered attendance
//     history (day/week/month/quarter/term/year handled by the client via
//     from/to) with a summary.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const sp = new URL(req.url).searchParams;
    const scope = await requireTeacherScope(ctx.userId, sp.get("school") || undefined);
    if (scope.studentIds.length === 0) {
      return sp.get("view") === "records"
        ? ok({ records: [], summary: { date: "", total: 0, present: 0, absent: 0, rate: 0, counts: {} }, classes: scope.classNames })
        : ok({ roster: [], classes: scope.classNames });
    }

    if (sp.get("view") === "records") {
      // Optionally narrow to a single pupil (must be in scope).
      let studentIds = scope.studentIds;
      const student = sp.get("student");
      if (student) { assertTeacherStudent(scope, student); studentIds = [student]; }
      const from = sp.get("from") || undefined;
      const to = sp.get("to") || undefined;
      const date = sp.get("date") || undefined;
      const status = sp.get("status") || undefined;
      const session = sp.get("session") || undefined;
      const opts = { ...(from || to ? { from, to } : { date }), status, session, studentIds };
      const [records, summary] = await Promise.all([
        listAttendance(scope.schoolId, opts),
        attendanceSummary(scope.schoolId, opts),
      ]);
      return ok({ records, summary, classes: scope.classNames });
    }

    // Register mode.
    const date = sp.get("date") || today();
    const session = sp.get("session") || "am";
    const cls = sp.get("class") || "";
    const students = await prisma.student.findMany({
      where: { id: { in: scope.studentIds }, status: { not: "archived" }, ...(cls ? { class: { name: cls } } : {}) },
      select: { id: true, firstName: true, lastName: true, medicalAlert: true, class: { select: { name: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    const marks = await prisma.attendanceRecord.findMany({
      where: { studentId: { in: students.map((s) => s.id) }, date, session },
      select: { studentId: true, status: true },
    });
    const byStudent = new Map(marks.map((m) => [m.studentId, m.status]));
    return ok({
      date, session,
      classes: scope.classNames,
      roster: students.map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        className: s.class?.name ?? null,
        medicalAlert: s.medicalAlert,
        status: byStudent.get(s.id) || "",
      })),
    });
  } catch (err) { return handleError(err); }
}

// POST — save a register: { school, date, session, marks: [{ studentId, status }] }.
// Every pupil is checked against the teacher's scope before writing.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const scope = await requireTeacherScope(ctx.userId, b.school || undefined);
    const date = String(b.date || "").trim();
    const session = String(b.session || "am");
    if (!date) throw new AppError("A date is required.", 400);
    const marks: { studentId: string; status: string }[] = Array.isArray(b.marks) ? b.marks : [];
    let saved = 0;
    for (const m of marks) {
      if (!m?.studentId || !m?.status) continue;
      assertTeacherStudent(scope, String(m.studentId));
      await upsertAttendance(scope.schoolId, {
        studentId: String(m.studentId), date, session, status: String(m.status), actorUserId: ctx.userId,
      });
      saved++;
    }
    return ok({ saved });
  } catch (err) { return handleError(err); }
}
