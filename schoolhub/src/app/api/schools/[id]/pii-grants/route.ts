import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { piiGrantSchema } from "@/lib/validation";
import { createUnmaskGrant, revokeUnmaskGrant } from "@/lib/pii";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };
// Tenant admin grants a named SIPlat staff member time-boxed PII access.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const grants = await prisma.piiUnmaskGrant.findMany({ where: { schoolId: params.id }, orderBy: { createdAt: "desc" }, take: 100 });
    return ok({ grants });
  } catch (err) { return handleError(err); }
}
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const body = piiGrantSchema.parse(await req.json());
    const res = await createUnmaskGrant({ ...body, schoolId: params.id, grantedByUserId: ctx.userId });
    return ok(res, 201);
  } catch (err) { return handleError(err); }
}
