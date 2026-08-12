import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { aiAskSchema } from "@/lib/validation";
import { gatherContext } from "@/lib/ai/retrieval";
import { rank, composeAnswer } from "@/lib/ai/answer";
import { maybeLlmAnswer } from "@/lib/ai/llm";
import { llmComplete } from "@/lib/ai/provider";
import { staffAnalytics } from "@/lib/ai/staff";
import { parentRewardAnalytics } from "@/lib/ai/parent";
import { matchGuidance } from "@/lib/ai/guidance";
import { handleError, ok } from "@/lib/http";

// Ask the assistant. Permission filtering happens in gatherContext BEFORE any
// answer is composed — the model/composer only ever sees authorised records.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const { question, lang, schoolId } = aiAskSchema.parse(await req.json());

    const context = await gatherContext(ctx.userId, { schoolId });

    // "How do I… / where is…" navigation guidance takes priority, then computed
    // operational answers, then record retrieval.
    let answer: string, citations: any[] = [], found: boolean;
    const guide = matchGuidance(question);
    const sa = !guide && context.isStaff ? await staffAnalytics(question, context.schoolIds) : null;
    const pa = !guide && !sa && context.hasChildren ? await parentRewardAnalytics(ctx.userId, question) : null;
    if (guide) {
      answer = guide.answer; citations = []; found = true;
    } else if (sa || pa) {
      const a = (sa || pa)!;
      answer = a.answer; citations = a.citations; found = a.found;
      // Rephrase the computed facts to answer the question naturally. The model
      // may only restate the given facts — it must not add or change numbers.
      // Skip for verbatim/long list answers so no items get dropped.
      if (found && !a.verbatim && answer.length < 600) {
        const phrased = await llmComplete(
          "You rephrase a factual answer so it directly and naturally answers the user's question. Use ONLY the facts and numbers provided — never add, drop, or change any number, name or fact. If the facts are a list, keep every item. Be concise and conversational: 1–3 sentences, no preamble." + (lang && lang !== "en" ? ` Reply in ${lang}.` : ""),
          `Question: ${question}\n\nFacts to convey:\n${a.answer}`,
          { temperature: 0 },
        );
        if (phrased && phrased.trim()) answer = phrased.trim();
      }
    } else {
      const ranked = rank(context.records, question, 10);
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
