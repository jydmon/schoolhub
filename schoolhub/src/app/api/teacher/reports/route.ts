import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { requireTeacherScope, assertTeacherStudent } from "@/lib/teacher";
import { handleError, ok, AppError } from "@/lib/http";

// Pupil reports the teacher can see/author for their assigned pupils.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const q = new URL(req.url).searchParams;
    const scope = await requireTeacherScope(ctx.userId, q.get("school") || undefined);
    if (scope.studentIds.length === 0) return ok({ reports: [] });
    const student = q.get("student");
    if (student) assertTeacherStudent(scope, student);
    const reports = await prisma.studentReport.findMany({
      where: { schoolId: scope.schoolId, studentId: student ? student : { in: scope.studentIds } },
      include: { student: { select: { firstName: true, lastName: true } } },
      orderBy: { updatedAt: "desc" }, take: 100,
    });
    return ok({ reports: reports.map((r) => ({ id: r.id, studentId: r.studentId, student: `${r.student.firstName} ${r.student.lastName}`.trim(), title: r.title, term: r.term, type: r.type, status: r.status, summary: r.summary, body: safe(r.bodyJson), updatedAt: r.updatedAt, authorMine: r.authorId === ctx.userId, editable: r.authorId === ctx.userId && ["draft", "submitted"].includes(r.status) })) });
  } catch (err) { return handleError(err); }
}

function safe(s: string) { try { return JSON.parse(s || "{}"); } catch { return {}; } }

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const scope = await requireTeacherScope(ctx.userId, b.school || undefined);
    if (!b.studentId || !String(b.title || "").trim()) throw new AppError("studentId and title are required", 400);
    assertTeacherStudent(scope, String(b.studentId));
    const report = await prisma.studentReport.create({
      data: {
        schoolId: scope.schoolId, studentId: String(b.studentId), type: b.type || "termly", title: String(b.title).trim(),
        term: b.term || null, summary: b.summary || null, bodyJson: JSON.stringify(b.body || {}),
        status: b.submit ? "submitted" : "draft", authorId: ctx.userId,
      },
    });
    return ok({ report }, 201);
  } catch (err) { return handleError(err); }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const scope = await requireTeacherScope(ctx.userId, b.school || undefined);
    if (!b.id) throw new AppError("id required", 400);
    const existing = await prisma.studentReport.findFirst({ where: { id: String(b.id), schoolId: scope.schoolId } });
    if (!existing) throw new AppError("Report not found", 404);
    assertTeacherStudent(scope, existing.studentId);
    if (existing.authorId !== ctx.userId) throw new AppError("You can only edit reports you authored.", 403);
    if (!["draft", "submitted"].includes(existing.status)) throw new AppError("This report has been approved or released and can no longer be edited.", 409);
    const data: any = {};
    if (b.title != null) data.title = String(b.title).trim();
    if (b.term != null) data.term = b.term;
    if (b.summary != null) data.summary = b.summary;
    if (b.type != null) data.type = b.type;
    if (b.body != null) data.bodyJson = JSON.stringify(b.body);
    if (b.submit) data.status = "submitted";
    const report = await prisma.studentReport.update({ where: { id: existing.id }, data });
    return ok({ report });
  } catch (err) { return handleError(err); }
}
