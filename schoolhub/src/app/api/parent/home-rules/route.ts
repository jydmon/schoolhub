import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { homeRuleSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

// Private, family-only home reward rules. Never exposed to school staff.
const HARMFUL = /\b(no (food|dinner|meal|lunch)|skip (a )?meal|starve|go hungry|hit|smack|beat|humiliat|embarrass|shame|lock (them|him|her) (in|out)|punish)\b/i;

export async function GET() {
  try {
    const ctx = await requireAuth();
    const rules = await prisma.homeRewardRule.findMany({ where: { guardianUserId: ctx.userId }, orderBy: { threshold: "asc" } });
    return ok({ rules });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const i = homeRuleSchema.parse(await req.json());
    // The caller must be a guardian of the child.
    const link = await prisma.guardianLink.findFirst({ where: { parentUserId: ctx.userId, studentId: i.studentId } });
    if (!link) return ok({ error: "Not a guardian of this student" }, 403);
    if (HARMFUL.test(i.reward)) return ok({ error: "That reward looks like a punishment or could be harmful. Home rewards should be positive." }, 400);

    const rule = await prisma.homeRewardRule.create({ data: { guardianUserId: ctx.userId, studentId: i.studentId, threshold: i.threshold, reward: i.reward } });
    await recordAudit({ action: AUDIT.HOME_RULE, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "HomeRewardRule", targetId: rule.id, metadata: { op: "create" } });
    return ok({ rule }, 201);
  } catch (err) { return handleError(err); }
}
