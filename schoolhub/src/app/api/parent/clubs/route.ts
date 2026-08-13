import { requireAuth } from "@/lib/session";
import { getChildren } from "@/lib/parent";
import { clubsForChildren } from "@/lib/clubs";
import { handleError, ok } from "@/lib/http";

// Parent view — clubs & activities for the requesting parent's linked children
// only, each annotated with the child's own attendance history. Child-scoped.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const children = await getChildren(ctx.userId);
    const nameById = new Map(children.map((c) => [c.student.id, `${c.student.firstName} ${c.student.lastName}`.trim()]));
    const schoolById = new Map(children.map((c) => [c.student.id, c.school.name]));
    const rows = await clubsForChildren(children.map((c) => c.student.id));
    const items = rows.map((r) => ({
      ...r,
      childName: nameById.get(r.studentId) || "Your child",
      schoolName: schoolById.get(r.studentId) || null,
    }));
    return ok({
      items,
      children: children.map((c) => ({ id: c.student.id, name: `${c.student.firstName} ${c.student.lastName}`.trim() })),
    });
  } catch (err) { return handleError(err); }
}
