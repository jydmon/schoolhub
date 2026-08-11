import { requireAuth } from "@/lib/session";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { helpVideoSchema } from "@/lib/validation";
import { listVideos, createVideo } from "@/lib/cms";
import { handleError, ok } from "@/lib/http";
import { PermissionError } from "@/lib/rbac";

// List how-to videos. ?school=<id> lists that school's Help Centre (its own +
// platform-wide, published only); a platform admin with no ?school sees all.
// ?admin=1 includes unpublished (requires MANAGE_CONTENT).
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(req.url);
    const schoolId = url.searchParams.get("school");
    const forAdmin = url.searchParams.get("admin") === "1";
    if (forAdmin) {
      if (schoolId) assertCan(ctx, PERMISSIONS.MANAGE_CONTENT, schoolId);
      else if (!ctx.isPlatformAdmin) throw new PermissionError("Platform administrator required");
    }
    const videos = await listVideos({
      schoolId: schoolId ?? undefined,
      category: url.searchParams.get("category") || undefined,
      audience: url.searchParams.get("audience") || undefined,
      forAdmin,
    });
    return ok({ videos });
  } catch (err) { return handleError(err); }
}

// Add a video (content management). Platform-wide when no ?school param.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(req.url);
    const schoolId = url.searchParams.get("school");
    if (schoolId) assertCan(ctx, PERMISSIONS.MANAGE_CONTENT, schoolId);
    else if (!ctx.isPlatformAdmin) throw new PermissionError("Platform administrator required");
    const body = helpVideoSchema.parse(await req.json());
    const res = await createVideo({ ...body, schoolId: schoolId ?? null, actorUserId: ctx.userId });
    return ok(res, 201);
  } catch (err) { return handleError(err); }
}
