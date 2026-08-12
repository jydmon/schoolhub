import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { requireTeacherScope, assertTeacherStudent } from "@/lib/teacher";
import { handleError, ok } from "@/lib/http";

// GET: recent behaviour for assigned pupils (or one). POST: log a behaviour
// record (merit / praise / incident / detention …) for an assigned pupil.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const q = new URL(req.url).searchParams;
    const scope = await requireTeacherScope(ctx.userId, q.get("school") || undefined);
    const student = q.get("student");
    if (student) assertTeacherStudent(scope, student);
    const where = student ? { studentId: student } : { studentId: { in: scope.studentIds.length ? scope.studentIds : ["_none_"] } };
    const rows = await prisma.rewardRecord.findMany({ where, include: { student: { select: { firstName: true, lastName: true } } }, orderBy: { at: "desc" }, take: 100 });
    return ok({ records: rows.map((r) => ({ id: r.id, student: `${r.student.firstName} ${r.student.lastName}`.trim(), studentId: r.studentId, type: r.type, points: r.points, positive: r.positive, category: r.category, note: r.note, teacherName: r.teacherName, at: r.at })) });
  } catch (err) { return handleError(err); }
}

const POSITIVE = new Set(["merit", "house_point", "badge", "praise", "certificate", "attendance_award"]);

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const scope = await requireTeacherScope(ctx.userId, b.school || undefined);
    if (!b.studentId || !b.type) return ok({ error: "studentId and type required" }, 400);
    assertTeacherStudent(scope, String(b.studentId));
    const positive = typeof b.positive === "boolean" ? b.positive : POSITIVE.has(String(b.type));
    const staff = scope.staffProfileId ? await prisma.staffProfile.findUnique({ where: { id: scope.staffProfileId }, include: { user: { select: { fullName: true } } } }) : null;
    const rec = await prisma.rewardRecord.create({
      data: {
        schoolId: scope.schoolId, studentId: String(b.studentId), type: String(b.type),
        points: typeof b.points === "number" ? b.points : (positive ? 1 : 0), positive,
        category: b.category || null, note: b.note || null,
        teacherName: staff?.user?.fullName || ctx.email, source: "manual",
      },
    });
    return ok({ record: rec }, 201);
  } catch (err) { return handleError(err); }
}
