import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { todayStr } from "@/lib/transport";
import { ROLES } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function dueState(dateStr?: string | null) {
  if (!dateStr) return null;
  const due = new Date(`${dateStr}T00:00:00`);
  const days = Math.round((due.getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: "overdue", days, tone: "warn" };
  if (days <= 30) return { label: "due soon", days, tone: "warn" };
  if (days <= 60) return { label: "upcoming", days, tone: "info" };
  return { label: "ok", days, tone: "good" };
}

// Driver home dashboard: today's journeys, next up, reminders, messages.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const date = todayStr();
    const [journeys, profile, unread, assignments, driverSchools] = await Promise.all([
      prisma.journey.findMany({ where: { driverUserId: ctx.userId, date }, include: { route: { select: { name: true } }, vehicle: { select: { reference: true, label: true } }, boardings: { select: { status: true } } }, orderBy: { session: "asc" } }),
      prisma.driverProfile.findUnique({ where: { userId: ctx.userId } }),
      prisma.driverMessage.count({ where: { driverUserId: ctx.userId, direction: "to_driver", read: false } }),
      prisma.routeDriver.findMany({ where: { driverUserId: ctx.userId } }),
      prisma.membership.findMany({ where: { userId: ctx.userId, role: ROLES.DRIVER }, include: { school: { select: { name: true } } } }),
    ]);
    const routeIds = Array.from(new Set(assignments.map((a) => a.routeId)));
    const routes = routeIds.length ? await prisma.route.findMany({ where: { id: { in: routeIds } }, select: { id: true, name: true } }) : [];
    const rMap = new Map(routes.map((r) => [r.id, r.name]));

    const jOut = journeys.map((j) => ({
      id: j.id, routeName: j.route.name, session: j.session, status: j.status,
      vehicle: j.vehicle ? (j.vehicle.label || j.vehicle.reference) : null,
      onboard: j.boardings.filter((b) => b.status === "boarded").length,
      total: j.boardings.length,
    }));
    const next = jOut.find((j) => j.status === "scheduled") || jOut.find((j) => j.status !== "completed" && j.status !== "cancelled") || null;

    const reminders = [
      profile?.licenceExpiry && { key: "Licence", date: profile.licenceExpiry, ...dueState(profile.licenceExpiry) },
      profile?.dbsExpiry && { key: "DBS", date: profile.dbsExpiry, ...dueState(profile.dbsExpiry) },
      profile?.medicalDue && { key: "Medical", date: profile.medicalDue, ...dueState(profile.medicalDue) },
    ].filter(Boolean).filter((r: any) => r.tone === "warn" || r.tone === "info");

    // Whether today's vehicle check has been done for each active journey.
    const checkedToday = await prisma.vehicleCheck.findMany({ where: { driverUserId: ctx.userId, date }, select: { journeyId: true, vehicleId: true, passed: true } });

    return ok({
      date,
      schoolName: driverSchools[0]?.school?.name || null,
      journeys: jOut,
      next,
      unreadMessages: unread,
      reminders,
      assignments: assignments.map((a) => ({ routeName: rMap.get(a.routeId) || "?", role: a.role, session: a.session })),
      checkedToday: checkedToday.map((c) => ({ journeyId: c.journeyId, passed: c.passed })),
      profile: profile ? { licenceNumber: profile.licenceNumber, licenceClasses: profile.licenceClasses, licenceExpiry: profile.licenceExpiry, dbsExpiry: profile.dbsExpiry, medicalDue: profile.medicalDue } : null,
    });
  } catch (err) { return handleError(err); }
}
