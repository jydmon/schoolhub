import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertHubAccess, listErrors, resolveError } from "@/lib/integration/hub";
import { hubErrorActionSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// GET → error queue (optional ?status). PATCH → retry / ignore / resolve / assign.
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertHubAccess(ctx, params.id);
    const status = new URL(req.url).searchParams.get("status") || undefined;
    return ok({ errors: await listErrors(params.id, status) });
  } catch (err) { return handleError(err); }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertHubAccess(ctx, params.id);
    const i = hubErrorActionSchema.parse(await req.json());
    const res = await resolveError({ schoolId: params.id, errorId: i.errorId, action: i.action, notes: i.notes, assignedToId: i.assignedToId, actor: { userId: ctx.userId, email: ctx.email } });
    return ok(res);
  } catch (err) { return handleError(err); }
}
