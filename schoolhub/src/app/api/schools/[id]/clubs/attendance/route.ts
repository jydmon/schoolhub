import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { recordSession, deleteSession } from "@/lib/clubs";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// POST: create a session for a club and record the attendance register.
// body: { clubId, date, startTime?, endTime?, note?, marks: [{studentId,status,note?}] }
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CONTENT, params.id);
    const b = await req.json().catch(() => ({}));
    if (!b.clubId) return ok({ error: "clubId required" }, 400);
    const res = await recordSession(params.id, String(b.clubId), {
      date: String(b.date || ""), startTime: b.startTime, endTime: b.endTime, note: b.note,
      marks: Array.isArray(b.marks) ? b.marks : [], actorUserId: ctx.userId,
    });
    return ok(res, 201);
  } catch (err) { return handleError(err); }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CONTENT, params.id);
    const id = new URL(req.url).searchParams.get("sessionId");
    if (!id) return ok({ error: "sessionId required" }, 400);
    await deleteSession(params.id, id);
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
