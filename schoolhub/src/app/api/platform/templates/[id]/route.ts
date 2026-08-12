import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { templatePatchSchema } from "@/lib/validation";
import { updateTemplate, setTemplateStatus, deleteTemplate } from "@/lib/templates";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "templates");
    const raw = await req.json();
    // Fast path: status change only.
    if (raw && typeof raw.status === "string" && Object.keys(raw).length === 1) {
      await setTemplateStatus(params.id, raw.status, { userId: ctx.userId });
      return ok({ ok: true });
    }
    const body = templatePatchSchema.parse(raw);
    await updateTemplate(params.id, { ...body, actorUserId: ctx.userId });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "templates");
    await deleteTemplate(params.id, { userId: ctx.userId });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
