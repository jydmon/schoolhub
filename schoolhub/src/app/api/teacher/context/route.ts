import { requireAuth } from "@/lib/session";
import { teacherSchools } from "@/lib/teacher";
import { handleError, ok } from "@/lib/http";

// The schools where the signed-in user holds a teacher role. Drives the school
// switcher in the teacher shell.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const schools = await teacherSchools(ctx.userId);
    return ok({ schools });
  } catch (err) { return handleError(err); }
}
