import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, ROLES } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Journey records for analysis: filter by date range / route / driver. Returns
// per-journey rows (route, vehicle, driver, boarding counts, delay, duration)
// plus summary stats and the option lists for the filters.
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const q = new URL(req.url).searchParams;
    const now = new Date();
    const from = q.get("from") || ymd(new Date(now.getTime() - 30 * 86400000));
    const to = q.get("to") || ymd(now);
    const routeId = q.get("route") || "";
    const driverId = q.get("driver") || "";

    const journeys = await prisma.journey.findMany({
      where: {
        schoolId: params.id, date: { gte: from, lte: to },
        ...(routeId ? { routeId } : {}), ...(driverId ? { driverUserId: driverId } : {}),
      },
      include: { route: { select: { name: true } }, vehicle: { select: { reference: true, label: true } }, boardings: { select: { status: true } } },
      orderBy: [{ date: "desc" }, { session: "asc" }],
      take: 1000,
    });

    const driverIds = Array.from(new Set(journeys.map((j) => j.driverUserId).filter(Boolean))) as string[];
    const [driverUsers, routes, allDrivers] = await Promise.all([
      driverIds.length ? prisma.user.findMany({ where: { id: { in: driverIds } }, select: { id: true, fullName: true } }) : [],
      prisma.route.findMany({ where: { schoolId: params.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.membership.findMany({ where: { schoolId: params.id, role: ROLES.DRIVER }, include: { user: { select: { id: true, fullName: true } } } }),
    ]);
    const dMap = new Map(driverUsers.map((u) => [u.id, u.fullName]));

    const rows = journeys.map((j) => {
      const boarded = j.boardings.filter((b) => b.status === "boarded" || b.status === "dropped_off").length;
      const absent = j.boardings.filter((b) => b.status === "absent").length;
      const durationMin = j.startedAt && j.completedAt ? Math.round((new Date(j.completedAt).getTime() - new Date(j.startedAt).getTime()) / 60000) : null;
      return {
        id: j.id, date: j.date, session: j.session, status: j.status,
        route: j.route?.name || "—", vehicle: j.vehicle ? (j.vehicle.label || j.vehicle.reference) : null,
        driver: j.driverUserId ? (dMap.get(j.driverUserId) || "—") : null,
        boarded, absent, total: j.boardings.length, delayMinutes: j.delayMinutes,
        startedAt: j.startedAt, completedAt: j.completedAt, durationMin,
      };
    });

    const completed = rows.filter((r) => r.status === "completed");
    const stats = {
      journeys: rows.length,
      completed: completed.length,
      cancelled: rows.filter((r) => r.status === "cancelled").length,
      totalBoardings: rows.reduce((s, r) => s + r.boarded, 0),
      totalAbsences: rows.reduce((s, r) => s + r.absent, 0),
      delayedJourneys: rows.filter((r) => r.delayMinutes > 0).length,
      avgDelay: rows.length ? Math.round(rows.reduce((s, r) => s + (r.delayMinutes || 0), 0) / rows.length) : 0,
      avgDurationMin: completed.filter((r) => r.durationMin != null).length
        ? Math.round(completed.filter((r) => r.durationMin != null).reduce((s, r) => s + (r.durationMin || 0), 0) / completed.filter((r) => r.durationMin != null).length)
        : null,
    };

    return ok({
      from, to, rows, stats,
      routes,
      drivers: allDrivers.map((m) => ({ id: m.user.id, name: m.user.fullName })),
    });
  } catch (err) { return handleError(err); }
}
