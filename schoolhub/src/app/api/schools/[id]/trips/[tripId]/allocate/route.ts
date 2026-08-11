import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { tripAllocateSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; tripId: string } };

// Allocate participating students / staff and set the lead teacher.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRIPS, params.id);
    const trip = await prisma.trip.findFirst({ where: { id: params.tripId, schoolId: params.id } });
    if (!trip) return ok({ error: "Not found" }, 404);
    const i = tripAllocateSchema.parse(await req.json());

    if (i.studentIds?.length) {
      const valid = await prisma.student.findMany({ where: { schoolId: params.id, id: { in: i.studentIds } }, select: { id: true } });
      for (const s of valid) {
        await prisma.tripStudent.upsert({ where: { tripId_studentId: { tripId: trip.id, studentId: s.id } }, update: {}, create: { tripId: trip.id, studentId: s.id, consent: trip.consentRequired ? "pending" : "given" } });
      }
    }
    if (i.staffIds?.length) {
      const valid = await prisma.membership.findMany({ where: { schoolId: params.id, userId: { in: i.staffIds } }, select: { userId: true } });
      for (const u of Array.from(new Set(valid.map((v) => v.userId)))) {
        await prisma.tripStaff.upsert({ where: { tripId_userId: { tripId: trip.id, userId: u } }, update: {}, create: { tripId: trip.id, userId: u, role: u === i.leadTeacherUserId ? "lead" : "supervisor" } });
      }
    }
    if (i.leadTeacherUserId) await prisma.trip.update({ where: { id: trip.id }, data: { leadTeacherUserId: i.leadTeacherUserId } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
