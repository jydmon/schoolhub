import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { supportChatSchema } from "@/lib/validation";
import { listSupportChats, openSupportChat } from "@/lib/platform-ops";
import { handleError, ok } from "@/lib/http";

// Helpdesk chat between SIPlat support and a school's tenant admin.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "help");
    const schoolId = new URL(req.url).searchParams.get("school") || undefined;
    return ok({ chats: await listSupportChats(schoolId) });
  } catch (err) { return handleError(err); }
}
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "help");
    const body = supportChatSchema.parse(await req.json());
    return ok(await openSupportChat({ ...body, openedById: ctx.userId }), 201);
  } catch (err) { return handleError(err); }
}
