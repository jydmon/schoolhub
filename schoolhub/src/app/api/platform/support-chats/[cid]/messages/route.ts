import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { chatMessageSchema } from "@/lib/validation";
import { postChatMessage } from "@/lib/platform-ops";
import { handleError, ok } from "@/lib/http";

type Params = { params: { cid: string } };
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "help");
    const { body } = chatMessageSchema.parse(await req.json());
    return ok(await postChatMessage(params.cid, body, { userId: ctx.userId, role: "support" }), 201);
  } catch (err) { return handleError(err); }
}
