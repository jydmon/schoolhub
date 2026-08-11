import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { tripUpdateSchema } from "@/lib/validation";
import { notifyStudentGuardians } from "@/lib/transport";
import { recordAudit } from "@/lib/audit";
import { AUDIT, ROLES, TRIP_UPDATE_LABELS } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { tripId: string } };
const STAFF: string[] = [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.TEACHER];

// Teacher one-tap trip update → timeline entry + parent notification.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const trip = await prisma.trip.findUnique({ where: { id: params.tripId } });
    if (!trip) return ok({ error: "Not found" }, 404);

    const isStaff = await prisma.membership.findFirst({ where: { userId: ctx.userId, schoolId: trip.schoolId, role: { in: STAFF } } });
    const isOnTrip = await prisma.tripStaff.findFirst({ where: { tripId: trip.id, userId: ctx.userId } });
    if (!isStaff && !isOnTrip && !ctx.isPlatformAdmin) return ok({ error: "Not authorised for this trip" }, 403);

    const { type, note } = tripUpdateSchema.parse(await req.json());
    await prisma.tripUpdate.create({ data: { tripId: trip.id, byUserId: ctx.userId, type, note: note || null } });

    // Status transitions from key updates.
    const statusMap: Record<string, string> = { coach_departed: "active", return_started: "active", returned: "completed" };
    if (statusMap[type]) await prisma.trip.update({ where: { id: trip.id }, data: { status: statusMap[type] } });

    const students = await prisma.tripStudent.findMany({ where: { tripId: trip.id }, select: { studentId: true } });
    await notifyStudentGuardians(students.map((s) => s.studentId), {
      kind: "trip_update", title: `${trip.title}: ${TRIP_UPDATE_LABELS[type] || type}`, body: note || undefined, schoolId: trip.schoolId, tripId: trip.id,
    });
    await recordAudit({ action: AUDIT.TRIP_UPDATE, schoolId: trip.schoolId, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Trip", targetId: trip.id, metadata: { type } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
