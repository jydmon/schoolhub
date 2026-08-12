import { requireAuth } from "@/lib/session";
import { teacherSchools, teacherScope } from "@/lib/teacher";
import { handleError, ok } from "@/lib/http";

// Which school(s) this teacher works in, and a snapshot of their assigned scope.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const schools = await teacherSchools(ctx.userId);
    const wanted = new URL(req.url).searchParams.get("school") || undefined;
    const scope = schools.length ? await teacherScope(ctx.userId, wanted) : null;
    return ok({
      email: ctx.email,
      schools,
      scope: scope ? {
        schoolId: scope.schoolId, schoolName: scope.schoolName,
        classes: scope.classNames, subjects: scope.subjects, yearGroups: scope.yearGroups,
        studentCount: scope.studentIds.length, tripCount: scope.tripIds.length,
      } : null,
    });
  } catch (err) { return handleError(err); }
}
