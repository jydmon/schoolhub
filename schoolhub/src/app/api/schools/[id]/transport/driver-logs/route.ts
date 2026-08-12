import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, ROLES } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Driver activity logs. Without ?driver: a roster of the school's drivers with
// journey counts and last-active date. With ?driver=<userId>: that driver's
// full journey log (route, session, start/finish, boardings, delay) plus the
// incidents they reported. School-admin / transport-manager only.
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const driver = new URL(req.url).searchParams.get("driver");

    if (driver) {
      const [user, journeys, incidents] = await Promise.all([
        prisma.user.findUnique({ where: { id: driver }, select: { id: true, fullName: true, email: true, phone: true } }),
        prisma.journey.findMany({ where: { schoolId: params.id, driverUserId: driver }, include: { route: { select: { name: true } }, vehicle: { select: { reference: true, label: true } }, boardings: { select: { status: true } } }, orderBy: [{ date: "desc" }, { session: "asc" }], take: 500 }),
        prisma.incident.findMany({ where: { schoolId: params.id, reportedByUserId: driver }, orderBy: { at: "desc" }, take: 100 }),
      ]);
      const rows = journeys.map((j) => {
        const boarded = j.boardings.filter((b) => b.status === "boarded" || b.status === "dropped_off").length;
        const absent = j.boardings.filter((b) => b.status === "absent").length;
        const durationMin = j.startedAt && j.completedAt ? Math.round((new Date(j.completedAt).getTime() - new Date(j.startedAt).getTime()) / 60000) : null;
        return { id: j.id, date: j.date, session: j.session, status: j.status, route: j.route?.name || "—", vehicle: j.vehicle ? (j.vehicle.label || j.vehicle.reference) : null, boarded, absent, total: j.boardings.length, delayMinutes: j.delayMinutes, startedAt: j.startedAt, completedAt: j.completedAt, durationMin };
      });
      const completed = rows.filter((r) => r.status === "completed");
      return ok({
        driver: user,
        summary: { journeys: rows.length, completed: completed.length, boardings: rows.reduce((s, r) => s + r.boarded, 0), absences: rows.reduce((s, r) => s + r.absent, 0), incidents: incidents.length, delayed: rows.filter((r) => r.delayMinutes > 0).length },
        rows,
        incidents: incidents.map((i) => ({ id: i.id, type: i.type, severity: i.severity, status: i.status, notes: i.notes, at: i.at })),
      });
    }

    // Roster with per-driver counts.
    const memberships = await prisma.membership.findMany({ where: { schoolId: params.id, role: ROLES.DRIVER }, include: { user: { select: { id: true, fullName: true, email: true } } } });
    const ids = memberships.map((m) => m.user.id);
    const journeys = ids.length ? await prisma.journey.findMany({ where: { schoolId: params.id, driverUserId: { in: ids } }, select: { driverUserId: true, status: true, date: true } }) : [];
    const drivers = memberships.map((m) => {
      const mine = journeys.filter((j) => j.driverUserId === m.user.id);
      const dates = mine.map((j) => j.date).sort();
      return { id: m.user.id, name: m.user.fullName, email: m.user.email, journeys: mine.length, completed: mine.filter((j) => j.status === "completed").length, lastActive: dates.length ? dates[dates.length - 1] : null };
    });
    return ok({ drivers });
  } catch (err) { return handleError(err); }
}
