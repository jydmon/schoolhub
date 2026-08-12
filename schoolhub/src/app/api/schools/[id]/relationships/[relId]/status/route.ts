import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { suspendRelationship, resumeRelationship, revokeRelationship, adminVerify } from "@/lib/guardian-relationships";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string; relId: string } };
const ipOf = (req: Request) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

// Change a relationship's state: suspend | resume | revoke | verify (school-verified).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const b = await req.json().catch(() => ({}));
    const actor = { userId: ctx.userId, email: ctx.email, role: "school", ip: ipOf(req) };
    const action = String(b.action || "");
    let relationship;
    if (action === "suspend") relationship = await suspendRelationship(params.id, params.relId, actor, b.note);
    else if (action === "resume") relationship = await resumeRelationship(params.id, params.relId, actor);
    else if (action === "revoke") relationship = await revokeRelationship(params.id, params.relId, actor, b.note);
    else if (action === "verify") { const r = await adminVerify(params.id, params.relId, actor, { ref: b.ref }); relationship = r.relationship; }
    else throw new AppError("Unknown action", 400);
    return ok({ relationship });
  } catch (err) { return handleError(err); }
}
