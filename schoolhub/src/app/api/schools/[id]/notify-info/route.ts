import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { notifySchoolAudience } from "@/lib/inbox";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string } };
// Notify parents/teachers of new information both in-app (red badge) and outside
// the app (push/email/…). Body: { audience, title, body?, kind?, channels? }.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CONTENT, params.id);
    const b = await req.json();
    if (!b?.title) throw new AppError("title required", 400);
    const audience = ["parents", "teachers", "both"].includes(b.audience) ? b.audience : "parents";
    const res = await notifySchoolAudience(params.id, audience, { kind: b.kind, title: b.title, body: b.body, channels: b.channels, actorUserId: ctx.userId });
    return ok(res, 201);
  } catch (err) { return handleError(err); }
}
