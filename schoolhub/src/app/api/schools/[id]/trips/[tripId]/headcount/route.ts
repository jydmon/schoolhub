import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { tripHeadcountSchema } from "@/lib/validation";
import { notifyStudentGuardians } from "@/lib/transport";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; tripId: string } };

// Record a headcount / welfare snapshot on a residential trip; a welfare/arrival
// snapshot also notifies parents (with no confidential per-child detail).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRIPS, params.id);
    const trip = await prisma.trip.findFirst({ where: { id: params.tripId, schoolId: params.id } });
    if (!trip) return ok({ error: "Not found" }, 404);
    const i = tripHeadcountSchema.parse(await req.json());
    const hc = await prisma.tripHeadcount.create({ data: { tripId: trip.id, byUserId: ctx.userId, kind: i.kind || "headcount", expected: i.expected, present: i.present, note: i.note || null } });

    if (["welfare", "arrival", "evening"].includes(i.kind || "")) {
      const students = await prisma.tripStudent.findMany({ where: { tripId: trip.id }, select: { studentId: true } });
      await notifyStudentGuardians(students.map((s) => s.studentId), { kind: "trip_update", title: `${trip.title}: ${i.kind} update — ${i.present}/${i.expected} present`, schoolId: trip.schoolId, tripId: trip.id });
    }
    await recordAudit({ action: AUDIT.TRIP_HEADCOUNT, schoolId: trip.schoolId, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Trip", targetId: trip.id, metadata: { kind: hc.kind, present: hc.present, expected: hc.expected } });
    return ok({ headcount: hc }, 201);
  } catch (err) { return handleError(err); }
}
