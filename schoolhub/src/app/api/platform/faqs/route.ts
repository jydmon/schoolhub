import { requirePlatformAdmin } from "@/lib/session";
import { listAll, createFaq } from "@/lib/faqs";
import { recordAudit } from "@/lib/audit";
import { handleError, ok, AppError } from "@/lib/http";

// Super Administrator FAQ management: list all (any status) + create.
export async function GET() {
  try {
    await requirePlatformAdmin();
    return ok({ items: await listAll() });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePlatformAdmin();
    const b = await req.json().catch(() => ({}));
    if (!b.question || !b.answer) throw new AppError("Question and answer are required.", 400);
    const faq = await createFaq(ctx.userId, b);
    await recordAudit({ action: "FAQ_CREATED", actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Faq", targetId: faq.id });
    return ok({ faq });
  } catch (err) { return handleError(err); }
}
