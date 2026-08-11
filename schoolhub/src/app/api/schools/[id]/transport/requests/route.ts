import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Transport change requests for the school (parents submit these; staff review late ones).
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const status = new URL(req.url).searchParams.get("status") || undefined;
    const requests = await prisma.transportRequest.findMany({
      where: { schoolId: params.id, ...(status ? { status } : {}) },
      include: { student: { select: { firstName: true, lastName: true, reference: true } } },
      orderBy: { createdAt: "desc" }, take: 100,
    });
    return ok({ requests: requests.map((r) => ({ ...r, payload: JSON.parse(r.payload || "{}") })) });
  } catch (err) { return handleError(err); }
}
