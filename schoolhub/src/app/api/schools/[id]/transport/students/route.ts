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
      select: { id: true, firstName: true, lastName: true, reference: true, yearGroup: true, medicalAlert: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    return ok({ students });
  } catch (err) { return handleError(err); }
}
