import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { requireTeacherScope } from "@/lib/teacher";
import { handleError, ok } from "@/lib/http";

// The teacher's assigned pupils (from their classes, subjects and trips).
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const scope = await requireTeacherScope(ctx.userId, new URL(req.url).searchParams.get("school") || undefined);
    if (scope.studentIds.length === 0) return ok({ students: [], classes: scope.classNames });
    const students = await prisma.student.findMany({
      where: { id: { in: scope.studentIds } },
      select: { id: true, firstName: true, lastName: true, reference: true, yearGroup: true, house: true, photoUrl: true, medicalAlert: true, sendIndicator: true, allergies: true, class: { select: { name: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    return ok({
      classes: scope.classNames,
      students: students.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`.trim(), reference: s.reference, yearGroup: s.yearGroup, className: s.class?.name || null, house: s.house, photoUrl: s.photoUrl, medicalAlert: s.medicalAlert, sendIndicator: s.sendIndicator, allergies: s.allergies })),
    });
  } catch (err) { return handleError(err); }
}
