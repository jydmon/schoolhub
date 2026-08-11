import { prisma } from "./db";
import { validateRoster, primaryDriver, type DriverAssignment } from "./route-drivers-logic";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";

// Transport helpers: parent notifications, guardian lookup, and (simulated)
// ETA / progress. Live GPS devices don't exist in this environment, so position
// and ETA are simulated behind these functions — swap in a maps provider and a
// real telematics feed to make them live (see the Phase 3 Google Maps connector).

export async function guardianUserIds(studentId: string): Promise<string[]> {
  const links = await prisma.guardianLink.findMany({ where: { studentId }, select: { parentUserId: true } });
  return Array.from(new Set(links.map((l) => l.parentUserId)));
}

/** Create an in-app notification for each recipient (the durable feed that push/SMS/email would fan out from). */
export async function notify(userIds: string[], n: { kind: string; title: string; body?: string; schoolId?: string | null; studentId?: string | null; journeyId?: string | null; tripId?: string | null }) {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId, kind: n.kind, title: n.title, body: n.body ?? null,
      schoolId: n.schoolId ?? null, studentId: n.studentId ?? null, journeyId: n.journeyId ?? null, tripId: n.tripId ?? null,
    })),
  });
}

/** Notify all guardians of a set of students that are on a journey. */
export async function notifyStudentGuardians(studentIds: string[], n: { kind: string; title: string; body?: string; schoolId?: string; journeyId?: string; tripId?: string }) {
  const links = await prisma.guardianLink.findMany({ where: { studentId: { in: studentIds } }, select: { parentUserId: true, studentId: true } });
  // one notification per guardian per student
  await prisma.notification.createMany({
    data: links.map((l) => ({ userId: l.parentUserId, studentId: l.studentId, kind: n.kind, title: n.title, body: n.body ?? null, schoolId: n.schoolId ?? null, journeyId: n.journeyId ?? null, tripId: n.tripId ?? null })),
  });
}

export function todayStr(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Planned time (HH:MM today) + delay → ETA Date. */
export function etaFor(plannedHHMM: string | null | undefined, delayMinutes: number, base = new Date()): Date | null {
  if (!plannedHHMM || !/^\d{2}:\d{2}$/.test(plannedHHMM)) return null;
  const [h, m] = plannedHHMM.split(":").map(Number);
  const d = new Date(base); d.setHours(h, m + delayMinutes, 0, 0);
  return d;
}

/** Journey progress from boarding records vs stops (used for parent tracking & control centre). */
export function journeyProgress(stops: { id: string; name: string; kind: string }[], boardings: { status: string }[]) {
  const done = boardings.filter((b) => b.status === "boarded" || b.status === "dropped_off").length;
  const total = stops.filter((s) => s.kind !== "school").length || stops.length;
  const stopsRemaining = Math.max(0, total - done);
  const next = stops.filter((s) => s.kind !== "school")[done];
  return { done, total, stopsRemaining, nextStopName: next?.name ?? "School" };
}

// ---------------------------------------------------------------------------
// Multi-driver route assignment (Phase 17). A route can have several drivers —
// a primary plus relief/second drivers, optionally per session (am/pm). The
// primary is mirrored onto Route.driverUserId for back-compat with journey
// creation. Pure roster rules live in route-drivers-logic.ts (unit-tested).
// ---------------------------------------------------------------------------

export async function listRouteDrivers(routeId: string) {
  return prisma.routeDriver.findMany({ where: { routeId }, orderBy: [{ role: "asc" }, { session: "asc" }] });
}

/** Replace a route's driver roster. Validates the roster, writes RouteDriver
 *  rows, and keeps Route.driverUserId pointing at the primary. */
export async function setRouteDrivers(args: {
  schoolId: string; routeId: string; drivers: DriverAssignment[];
  actorUserId?: string | null; actorEmail?: string | null;
}): Promise<{ assignments: DriverAssignment[] }> {
  const route = await prisma.route.findFirst({ where: { id: args.routeId, schoolId: args.schoolId } });
  if (!route) throw new Error("route not found");

  const check = validateRoster(args.drivers);
  if (!check.ok) throw new Error(check.reason);
  const assignments = check.assignments;
  const primary = primaryDriver(assignments);

  await prisma.$transaction([
    prisma.routeDriver.deleteMany({ where: { routeId: args.routeId } }),
    prisma.routeDriver.createMany({
      data: assignments.map((a) => ({
        routeId: args.routeId, schoolId: args.schoolId,
        driverUserId: a.driverUserId, role: a.role ?? "relief", session: a.session ?? "all",
        assignedById: args.actorUserId ?? null,
      })),
    }),
    prisma.route.update({ where: { id: args.routeId }, data: { driverUserId: primary } }),
  ]);

  await recordAudit({ action: AUDIT.ROUTE_DRIVERS_SET, schoolId: args.schoolId, actorUserId: args.actorUserId, actorEmail: args.actorEmail, targetType: "Route", targetId: args.routeId, metadata: { count: assignments.length, primary } });
  return { assignments };
}
