import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { TRIP_UPDATE_LABELS } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

// Parent trip timeline — only trips their own children are on.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const links = await prisma.guardianLink.findMany({ where: { parentUserId: ctx.userId }, select: { studentId: true, student: { select: { firstName: true, lastName: true } } } });
    const studentIds = links.map((l) => l.studentId);
    if (studentIds.length === 0) return ok({ trips: [] });

    const tripStudents = await prisma.tripStudent.findMany({
      where: { studentId: { in: studentIds } },
      include: { trip: { include: {
        updates: { orderBy: { at: "asc" } },
        days: { orderBy: { sequence: "asc" } },
        headcounts: { orderBy: { at: "desc" }, take: 1 },
        photos: { where: { sharedWithParents: true }, orderBy: { at: "desc" } },
      } } },
      orderBy: { trip: { date: "desc" } },
    });

    const nameByStudent = new Map(links.map((l) => [l.studentId, `${l.student.firstName} ${l.student.lastName}`]));
    return ok({
      trips: tripStudents.map((ts) => ({
        tripId: ts.trip.id,
        title: ts.trip.title,
        date: ts.trip.date,
        destination: ts.trip.destination,
        departureTime: ts.trip.departureTime,
        returnTime: ts.trip.returnTime,
        status: ts.trip.status,
        child: nameByStudent.get(ts.studentId),
        childStudentId: ts.studentId,
        consent: ts.consent,
        consentRequired: ts.trip.consentRequired,
        paymentStatus: ts.trip.paymentStatus,
        packingList: ts.trip.packingList,
        isResidential: ts.trip.isResidential,
        endDate: ts.trip.endDate,
        accommodation: ts.trip.accommodation,
        returnPlan: ts.trip.returnPlan,
        days: ts.trip.days.map((d) => ({ date: d.date, title: d.title, itinerary: d.itinerary })),
        latestHeadcount: ts.trip.headcounts[0] ? { present: ts.trip.headcounts[0].present, expected: ts.trip.headcounts[0].expected, kind: ts.trip.headcounts[0].kind, at: ts.trip.headcounts[0].at } : null,
        photos: ts.trip.photos.map((p) => ({ url: p.url, caption: p.caption })),
        timeline: ts.trip.updates.map((u) => ({ label: TRIP_UPDATE_LABELS[u.type] || u.type, note: u.note, at: u.at })),
      })),
    });
  } catch (err) { return handleError(err); }
}
