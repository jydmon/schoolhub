import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { requireTeacherScope } from "@/lib/teacher";
import { handleError, ok, AppError } from "@/lib/http";

// GET — the teacher's trips (they lead or supervise). Without ?trip= returns the
// list with pupil counts; with ?trip=<id> (must be one of theirs) returns the
// trip detail: staff, and the pupil roster with consent + flags.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const sp = new URL(req.url).searchParams;
    const scope = await requireTeacherScope(ctx.userId, sp.get("school") || undefined);
    const tripId = sp.get("trip");

    if (tripId) {
      if (!scope.tripIds.includes(tripId)) throw new AppError("This trip is not one you lead or supervise.", 403);
      const [trip, staff, students] = await Promise.all([
        prisma.trip.findUnique({ where: { id: tripId }, select: { title: true, date: true, destination: true, departureTime: true } }),
        prisma.tripStaff.findMany({ where: { tripId }, include: { user: { select: { fullName: true, email: true } } } }),
        prisma.tripStudent.findMany({ where: { tripId }, include: { student: { select: { firstName: true, lastName: true, yearGroup: true, medicalAlert: true, allergies: true } } } }),
      ]);
      return ok({
        trip,
        staff: staff.map((s) => ({ name: s.user?.fullName || s.user?.email || "—", role: s.role })),
        students: students.map((s) => ({
          id: s.studentId,
          name: `${s.student?.firstName ?? ""} ${s.student?.lastName ?? ""}`.trim(),
          yearGroup: s.student?.yearGroup ?? null,
          consent: s.consent,
          medicalAlert: s.student?.medicalAlert ?? false,
          allergies: s.student?.allergies ?? null,
        })),
      });
    }

    if (scope.tripIds.length === 0) return ok({ trips: [] });
    const trips = await prisma.trip.findMany({
      where: { id: { in: scope.tripIds } },
      orderBy: { date: "asc" },
      include: { _count: { select: { students: true } } },
    });
    return ok({
      trips: trips.map((t) => ({ id: t.id, title: t.title, date: t.date, destination: t.destination, students: t._count.students })),
    });
  } catch (err) { return handleError(err); }
}
