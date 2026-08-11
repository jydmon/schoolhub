import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { aiAskSchema } from "@/lib/validation";
import { gatherContext } from "@/lib/ai/retrieval";
import { rank, composeAnswer } from "@/lib/ai/answer";
import { maybeLlmAnswer } from "@/lib/ai/llm";
import { staffAnalytics } from "@/lib/ai/staff";
import { parentRewardAnalytics } from "@/lib/ai/parent";
import { handleError, ok } from "@/lib/http";

// Ask the assistant. Permission filtering happens in gatherContext BEFORE any
// answer is composed — the model/composer only ever sees authorised records.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const { question, lang, schoolId } = aiAskSchema.parse(await req.json());

    const context = await gatherContext(ctx.userId, { schoolId });

    // Staff operational questions answered from computed data first.
    let answer: string, citations: any[] = [], found: boolean;
    const sa = context.isStaff ? await staffAnalytics(question, context.schoolIds) : null;
    const pa = !sa && context.hasChildren ? await parentRewardAnalytics(ctx.userId, question) : null;
    if (sa || pa) {
      const a = (sa || pa)!;
      answer = a.answer; citations = a.citations; found = a.found;
    } else {
      const ranked = rank(context.records, question);
      const composed = composeAnswer(question, ranked, { lang, isStaff: context.isStaff });
      const llm = await maybeLlmAnswer(question, ranked, lang || "en");
      answer = llm ? `${llm}` : composed.answer;
      citations = composed.citations;
      found = composed.found;
    }

    const schoolForLog = schoolId || context.schoolIds[0] || null;
    await prisma.aiQuery.create({
      data: { schoolId: schoolForLog, userId: ctx.userId, role: context.isStaff ? "staff" : "parent", question, lang: lang || "en", answer, citations: JSON.stringify(citations), found },
    });
    await recordAudit({
      action: AUDIT.AI_QUERY, schoolId: schoolForLog, actorUserId: ctx.userId, actorEmail: ctx.email,
      metadata: { question, found, citations: citations.length, lang: lang || "en" },
    });

    return ok({ answer, citations, found });
  } catch (err) {
    return handleError(err);
  }
}
