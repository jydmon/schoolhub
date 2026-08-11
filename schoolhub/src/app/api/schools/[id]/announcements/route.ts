import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { announcementSchema } from "@/lib/validation";
import { listAnnouncements, createAnnouncement } from "@/lib/announcements";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_DASHBOARDS, params.id);
    return ok({ announcements: await listAnnouncements(params.id) });
  } catch (err) { return handleError(err); }
}
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CONTENT, params.id);
    const body = announcementSchema.parse(await req.json());
    return ok(await createAnnouncement({ ...body, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email }), 201);
  } catch (err) { return handleError(err); }
}
