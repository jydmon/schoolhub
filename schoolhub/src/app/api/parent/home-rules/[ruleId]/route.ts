import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { homeRuleUpdateSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

type Params = { params: { ruleId: string } };
const HARMFUL = /\b(no (food|dinner|meal|lunch)|skip (a )?meal|starve|go hungry|hit|smack|beat|humiliat|embarrass|shame|punish)\b/i;

// Pause/edit a home rule.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const rule = await prisma.homeRewardRule.findFirst({ where: { id: params.ruleId, guardianUserId: ctx.userId } });
    if (!rule) return ok({ error: "Not found" }, 404);
    const i = homeRuleUpdateSchema.parse(await req.json());
    if (i.reward && HARMFUL.test(i.reward)) return ok({ error: "Home rewards should be positive." }, 400);
    const data: Record<string, unknown> = {};
    if (i.active !== undefined) data.active = i.active;
    if (i.reward !== undefined) data.reward = i.reward;
    if (i.threshold !== undefined) data.threshold = i.threshold;
    const updated = await prisma.homeRewardRule.update({ where: { id: rule.id }, data });
    return ok({ rule: updated });
  } catch (err) { return handleError(err); }
}

// Delete a home rule.
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const rule = await prisma.homeRewardRule.findFirst({ where: { id: params.ruleId, guardianUserId: ctx.userId } });
    if (!rule) return ok({ error: "Not found" }, 404);
    await prisma.homeRewardRule.delete({ where: { id: rule.id } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
