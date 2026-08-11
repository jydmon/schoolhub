import { prisma } from "./db";
import type { AuthContext } from "./rbac";
import { ROLES } from "./constants";

/** Load a journey the caller may drive/manage, or null. */
export async function loadDriverJourney(ctx: AuthContext, journeyId: string) {
  const journey = await prisma.journey.findUnique({ where: { id: journeyId } });
  if (!journey) return null;
  if (journey.driverUserId === ctx.userId || ctx.isPlatformAdmin) return journey;
  // Transport managers / admins of that school may also act.
  const m = await prisma.membership.findFirst({ where: { userId: ctx.userId, schoolId: journey.schoolId, role: { in: [ROLES.TRANSPORT_MANAGER, ROLES.SCHOOL_ADMIN] } } });
  return m ? journey : null;
}

const weekday = (date: string) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${date}T00:00:00`).getDay()];

/** The students assigned to a journey's route for its session/day. */
export async function rosterForJourney(journey: { schoolId: string; routeId: string; session: string; date: string }) {
  const profiles = await prisma.studentTransportProfile.findMany({
    where: {
      routeId: journey.routeId,
      ...(journey.session === "am" ? { afternoonOnly: false } : { morningOnly: false }),
    },
    include: { student: { select: { id: true, firstName: true, lastName: true, preferredName: true, photoUrl: true, reference: true, medicalAlert: true } } },
  });
  const wd = weekday(journey.date);
  return profiles.filter((p) => (p.transportDays || "").split(",").map((s) => s.trim()).includes(wd));
}
