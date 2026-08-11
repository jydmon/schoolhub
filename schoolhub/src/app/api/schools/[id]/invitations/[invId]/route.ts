import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { resendInvitation, revokeInvitation } from "@/lib/invitations";
import { handleError, ok, AppError } from "@/lib/http";
import { z } from "zod";

type Params = { params: { id: string; invId: string } };
const schema = z.object({ action: z.enum(["resend", "revoke"]) });

// Resend or revoke an invitation (admin).
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const { action } = schema.parse(await req.json());
    const actor = { userId: ctx.userId, email: ctx.email };
    if (action === "resend") return ok(await resendInvitation(params.id, params.invId, actor));
    if (action === "revoke") return ok(await revokeInvitation(params.id, params.invId, actor));
    throw new AppError("Unknown action", 400);
  } catch (err) { return handleError(err); }
}
