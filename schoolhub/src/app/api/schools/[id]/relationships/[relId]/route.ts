import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { relationshipDetail, amendRelationship } from "@/lib/guardian-relationships";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; relId: string } };
const ipOf = (req: Request) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

// Full relationship detail including its complete audit history.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    return ok({ relationship: await relationshipDetail(params.id, params.relId) });
  } catch (err) { return handleError(err); }
}

// Amend relationship details (records a before/after audit entry).
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const b = await req.json().catch(() => ({}));
    const rel = await amendRelationship(params.id, params.relId, b, { userId: ctx.userId, email: ctx.email, role: "school", ip: ipOf(req) });
    return ok({ relationship: rel });
  } catch (err) { return handleError(err); }
}
