import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Minimal pupil list for transport pickers (route assignment, enquiries).
// Scoped to MANAGE_TRANSPORT so transport managers can use it without the
// broader MANAGE_USERS permission.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const students = await prisma.student.findMany({
      where: { schoolId: params.id },
      select: {
        id: true, firstName: true, lastName: true, reference: true, yearGroup: true, medicalAlert: true,
        class: { select: { name: true } },
        transportProfile: { select: { routeId: true, feeStatus: true, transportDays: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    return ok({
      students: students.map((s) => ({
        id: s.id, firstName: s.firstName, lastName: s.lastName, reference: s.reference,
        yearGroup: s.yearGroup, medicalAlert: s.medicalAlert, className: s.class?.name || null,
        routeId: s.transportProfile?.routeId || null, feeStatus: s.transportProfile?.feeStatus || null,
      })),
    });
  } catch (err) { return handleError(err); }
}
