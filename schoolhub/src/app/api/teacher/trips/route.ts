import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { requireTeacherScope } from "@/lib/teacher";
import { handleError, ok, AppError } from "@/lib/http";

// Trips the teacher leads/supervises. GET: list (or ?trip=id for the roster).
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const q = new URL(req.url).searchParams;
    const scope = await requireTeacherScope(ctx.userId, q.get("school") || undefined);
    if (scope.tripIds.length === 0) return ok({ trips: [] });
    const tripId = q.get("trip");
    if (tripId) {
      if (!scope.tripIds.includes(tripId)) throw new AppError("This trip is not one you supervise.", 403);
      const [trip, students, staff] = await Promise.all([
        prisma.trip.findUnique({ where: { id: tripId } }),
        prisma.tripStudent.findMany({ where: { tripId }, include: { student: { select: { firstName: true, lastName: true, yearGroup: true, medicalAlert: true, allergies: true } } } }),
        prisma.tripStaff.findMany({ where: { tripId }, include: { user: { select: { fullName: true } } } }),
      ]);
      return ok({
        trip: trip ? { id: trip.id, title: trip.title, date: trip.date, destination: trip.destination, departureTime: trip.departureTime, purpose: trip.purpose, consentRequired: trip.consentRequired } : null,
        students: students.map((s) => ({ id: s.studentId, name: `${s.student.firstName} ${s.student.lastName}`.trim(), yearGroup: s.student.yearGroup, consent: s.consent, medicalAlert: s.student.medicalAlert, allergies: s.student.allergies })),
        staff: staff.map((s) => ({ name: s.user?.fullName, role: s.role })),
      });
    }
    const trips = await prisma.trip.findMany({ where: { id: { in: scope.tripIds } }, include: { _count: { select: { students: true } } }, orderBy: { date: "asc" } });
    return ok({ trips: trips.map((t) => ({ id: t.id, title: t.title, date: t.date, destination: t.destination, status: t.status, students: t._count.students, consentRequired: t.consentRequired })) });
  } catch (err) { return handleError(err); }
}

// Record a welfare headcount for a supervised trip.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const scope = await requireTeacherScope(ctx.userId, b.school || undefined);
    if (!b.tripId || !scope.tripIds.includes(String(b.tripId))) throw new AppError("This trip is not one you supervise.", 403);
    const present = Number(b.present) || 0;
    const expected = Number(b.expected) || 0;
    const hc = await prisma.tripHeadcount.create({ data: { tripId: String(b.tripId), present, expected, note: b.note || null, byUserId: ctx.userId, kind: b.kind || "headcount" } });
    return ok({ headcount: hc }, 201);
  } catch (err) { return handleError(err); }
}
