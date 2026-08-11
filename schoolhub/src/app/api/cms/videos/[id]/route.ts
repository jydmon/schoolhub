import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { setVideoPublished, removeVideo, recordVideoView, updateVideo } from "@/lib/cms";
import { handleError, ok, AppError } from "@/lib/http";
import { PermissionError } from "@/lib/rbac";

type Params = { params: { id: string } };

async function assertManage(ctx: any, videoSchoolId: string | null) {
  if (videoSchoolId) assertCan(ctx, PERMISSIONS.MANAGE_CONTENT, videoSchoolId);
  else if (!ctx.isPlatformAdmin) throw new PermissionError("Platform administrator required");
}

// Publish/unpublish, or (action=view) increment the view counter.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const video = await prisma.helpVideo.findUnique({ where: { id: params.id } });
    if (!video) throw new AppError("Video not found", 404);
    const body = await req.json();
    if (body.action === "view") { await recordVideoView(params.id); return ok({ ok: true }); }
    await assertManage(ctx, video.schoolId);
    const fields = ["title", "description", "category", "audience", "url"] as const;
    const hasContent = fields.some((k) => body[k] !== undefined);
    if (hasContent) {
      const patch: any = {};
      for (const k of fields) if (typeof body[k] === "string") patch[k] = body[k];
      if (typeof body.published === "boolean") patch.published = body.published;
      await updateVideo(params.id, patch, { userId: ctx.userId });
    } else if (typeof body.published === "boolean") {
      await setVideoPublished(params.id, body.published, { userId: ctx.userId });
    }
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const video = await prisma.helpVideo.findUnique({ where: { id: params.id } });
    if (!video) throw new AppError("Video not found", 404);
    await assertManage(ctx, video.schoolId);
    await removeVideo(params.id, { userId: ctx.userId });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
