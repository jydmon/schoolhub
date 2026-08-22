import { requireAuth } from "@/lib/session";
import { getChildren } from "@/lib/parent";
import { listAttendance } from "@/lib/attendance";
import { handleError, ok, AppError } from "@/lib/http";

// Attendance for one of the signed-in parent's own children, with the same
// filtering the staff portals have: period (via from/to), status and session.
// Scoped strictly to the caller's guardian links — a parent can only ever read
// their own children's marks.
//   ?student=<id>  (defaults to the first linked child)
//   ?from=&to=  or  ?date=   ·   ?status=   ·   ?session=
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const kids = await getChildren(ctx.userId);
    const children = kids.map((k) => ({ id: k.student.id, name: `${k.student.firstName} ${k.student.lastName}`.trim(), schoolId: k.student.schoolId }));
    if (children.length === 0) {
      return ok({ child: null, children: [], summary: { total: 0, present: 0, late: 0, absent: 0, rate: null }, records: [] });
    }

    const sp = new URL(req.url).searchParams;
    const requested = sp.get("student");
    let chosen = children[0];
    if (requested) {
      const found = children.find((c) => c.id === requested);
      if (!found) throw new AppError("That child is not linked to your account.", 403);
      chosen = found;
    }

    const from = sp.get("from") || undefined;
    const to = sp.get("to") || undefined;
    const date = sp.get("date") || undefined;
    const status = sp.get("status") || undefined;
    const session = sp.get("session") || undefined;
    const rangeOpts = from || to ? { from, to } : { date };

    // Session-aware but status-independent base, so the summary always reflects
    // the child's overall attendance for the period; the status filter then only
    // narrows the record list.
    const base = await listAttendance(chosen.schoolId, { ...rangeOpts, session, studentIds: [chosen.id] });
    const present = base.filter((r) => r.status === "present").length;
    const late = base.filter((r) => r.status === "late").length;
    const total = base.length;
    const absent = total - present - late;
    const rate = total ? Math.round(((present + late) / total) * 1000) / 10 : null;
    const records = status ? base.filter((r) => r.status === status) : base;

    return ok({
      child: { id: chosen.id, name: chosen.name },
      children: children.map((c) => ({ id: c.id, name: c.name })),
      summary: { total, present, late, absent, rate },
      records: records.map((r) => ({ date: r.date, session: r.session, status: r.status, note: r.note })),
    });
  } catch (err) { return handleError(err); }
}
