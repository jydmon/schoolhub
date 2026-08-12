import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { requireTeacherScope, assertTeacherStudent } from "@/lib/teacher";
import { handleError, ok } from "@/lib/http";

const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// GET: the register for a date/session — assigned pupils (optionally one class)
// with their current mark. POST: save marks for those pupils.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const q = new URL(req.url).searchParams;
    const scope = await requireTeacherScope(ctx.userId, q.get("school") || undefined);
    const date = q.get("date") || todayStr();
    const session = q.get("session") || "am";
    const className = q.get("class") || "";

    let studentIds = scope.studentIds;
    if (className) {
      const inClass = await prisma.student.findMany({ where: { id: { in: scope.studentIds }, class: { name: className } }, select: { id: true } });
      studentIds = inClass.map((s) => s.id);
    }
    if (studentIds.length === 0) return ok({ date, session, roster: [], classes: scope.classNames });

    const [students, records] = await Promise.all([
      prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, firstName: true, lastName: true, class: { select: { name: true } }, medicalAlert: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
      prisma.attendanceRecord.findMany({ where: { studentId: { in: studentIds }, date, session } }),
    ]);
    const rMap = new Map(records.map((r) => [r.studentId, r]));
    return ok({
      date, session, classes: scope.classNames,
      roster: students.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`.trim(), className: s.class?.name || null, medicalAlert: s.medicalAlert, status: rMap.get(s.id)?.status || "", note: rMap.get(s.id)?.note || "" })),
    });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const scope = await requireTeacherScope(ctx.userId, b.school || undefined);
    const date = b.date || todayStr();
    const session = b.session || "am";
    const marks: { studentId: string; status: string; note?: string }[] = Array.isArray(b.marks) ? b.marks : [];
    let saved = 0;
    for (const m of marks) {
      if (!m.studentId || !m.status) continue;
      assertTeacherStudent(scope, m.studentId);
      await prisma.attendanceRecord.upsert({
        where: { studentId_date_session: { studentId: m.studentId, date, session } },
        update: { status: m.status, note: m.note || null },
        create: { schoolId: scope.schoolId, studentId: m.studentId, date, session, status: m.status, note: m.note || null },
      });
      saved++;
    }
    return ok({ saved });
  } catch (err) { return handleError(err); }
}
