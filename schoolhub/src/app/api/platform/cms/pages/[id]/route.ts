import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { updatePage, setPageStatus, deletePage } from "@/lib/cms-pages";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "cms");
    const b = await req.json().catch(() => ({}));
    if (typeof b.status === "string" && Object.keys(b).length === 1) {
      await setPageStatus(params.id, b.status, { userId: ctx.userId });
      return ok({ ok: true });
    }
    await updatePage(params.id, b, { userId: ctx.userId });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "cms");
    await deletePage(params.id, { userId: ctx.userId });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
