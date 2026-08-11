import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { templateSchema } from "@/lib/validation";
import { listPlatformTemplates, createTemplate } from "@/lib/templates";
import { handleError, ok } from "@/lib/http";

// Platform-level template library (shared to tenant admins when flagged).
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "templates");
    const kind = new URL(req.url).searchParams.get("kind") || undefined;
    return ok({ templates: await listPlatformTemplates(kind) });
  } catch (err) { return handleError(err); }
}
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "templates");
    const body = templateSchema.parse(await req.json());
    return ok(await createTemplate({ ...body, scope: "platform", actorUserId: ctx.userId }), 201);
  } catch (err) { return handleError(err); }
}
