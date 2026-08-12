import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { transportProfileSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; studentId: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const profile = await prisma.studentTransportProfile.findUnique({ where: { studentId: params.studentId } });
    return ok({ profile });
  } catch (err) { return handleError(err); }
}

// Create or replace a student's transport profile.
export async function PUT(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const student = await prisma.student.findFirst({ where: { id: params.studentId, schoolId: params.id } });
    if (!student) return ok({ error: "Student not found" }, 404);
    const i = transportProfileSchema.parse(await req.json());
    const data = {
      schoolId: params.id,
      homeAddress: i.homeAddress ?? null, homeLat: i.homeLat ?? null, homeLng: i.homeLng ?? null,
      morningStopId: i.morningStopId ?? null, afternoonStopId: i.afternoonStopId ?? null,
      routeId: i.routeId ?? null, vehicleId: i.vehicleId ?? null,
      transportDays: i.transportDays ?? "Mon,Tue,Wed,Thu,Fri", morningOnly: !!i.morningOnly, afternoonOnly: !!i.afternoonOnly,
      accessibility: i.accessibility ?? null, emergencyContact: i.emergencyContact ?? null,
      approvedDropoffs: JSON.stringify(i.approvedDropoffs ?? []), altLocations: JSON.stringify(i.altLocations ?? []),
      // fee status is managed via the dedicated /transport/fees endpoint so a
      // route assignment here never clobbers it.
      ...(i.feeStatus !== undefined ? { feeStatus: i.feeStatus } : {}),
    };
    const profile = await prisma.studentTransportProfile.upsert({
      where: { studentId: params.studentId }, update: data, create: { studentId: params.studentId, ...data },
    });
    return ok({ profile });
  } catch (err) { return handleError(err); }
}
