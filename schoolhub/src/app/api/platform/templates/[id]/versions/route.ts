import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { listTemplateVersions, restoreTemplateVersion } from "@/lib/templates";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "templates");
    return ok({ versions: await listTemplateVersions(params.id) });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "templates");
    const body = await req.json().catch(() => ({}));
    if (!body?.versionId) throw new AppError("versionId required", 400);
    await restoreTemplateVersion(params.id, String(body.versionId), { userId: ctx.userId });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
