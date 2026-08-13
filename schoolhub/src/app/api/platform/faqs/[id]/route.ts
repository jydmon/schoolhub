import { requirePlatformAdmin } from "@/lib/session";
import { updateFaq, removeFaq } from "@/lib/faqs";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

// Edit / publish / unpublish / archive (PUT) and delete (DELETE) an FAQ.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePlatformAdmin();
    const b = await req.json().catch(() => ({}));
    const faq = await updateFaq(params.id, b);
    await recordAudit({ action: "FAQ_UPDATED", actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Faq", targetId: params.id, metadata: { status: faq.status } });
    return ok({ faq });
  } catch (err) { return handleError(err); }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePlatformAdmin();
    await removeFaq(params.id);
    await recordAudit({ action: "FAQ_DELETED", actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Faq", targetId: params.id });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
