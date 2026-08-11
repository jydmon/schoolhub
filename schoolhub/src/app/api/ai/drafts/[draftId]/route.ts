import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { aiDraftUpdateSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

type Params = { params: { draftId: string } };

// Human confirmation workflow: edit, confirm, or discard a draft. Confirming
// only marks it approved — actual sending is a later (notifications) phase.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const existing = await prisma.aiDraft.findFirst({ where: { id: params.draftId, createdById: ctx.userId } });
    if (!existing) return ok({ error: "Not found" }, 404);

    const input = aiDraftUpdateSchema.parse(await req.json());
    const data: Record<string, unknown> = {};
    if (input.body !== undefined) data.body = input.body;
    if (input.status !== undefined) data.status = input.status;

    const draft = await prisma.aiDraft.update({ where: { id: existing.id }, data });
    if (input.status === "confirmed") {
      await recordAudit({ action: AUDIT.DRAFT_CONFIRMED, schoolId: existing.schoolId, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "AiDraft", targetId: existing.id, metadata: { type: existing.type } });
    }
    return ok({ draft });
  } catch (err) {
    return handleError(err);
  }
}
