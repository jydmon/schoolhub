import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { sendAnnouncement } from "@/lib/announcements";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string; aid: string } };
export async function POST(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CONTENT, params.id);
    const a = await prisma.announcement.findUnique({ where: { id: params.aid } });
    if (!a || a.schoolId !== params.id) throw new AppError("Announcement not found", 404);
    return ok(await sendAnnouncement(params.aid, { userId: ctx.userId, email: ctx.email }));
  } catch (err) { return handleError(err); }
}
