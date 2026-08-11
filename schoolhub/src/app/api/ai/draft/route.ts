import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { AUDIT, ROLES, LANGUAGES } from "@/lib/constants";
import { aiDraftSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

const STAFF_ROLES: string[] = [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.TEACHER, ROLES.TRANSPORT_MANAGER, ROLES.SUPPORT_STAFF];

// Generate a DRAFT only. Nothing is sent or changed until a human confirms it.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const input = aiDraftSchema.parse(await req.json());
    const schoolId = input.schoolId;

    // Drafting is a staff capability.
    if (schoolId) {
      const staff = await prisma.membership.findFirst({ where: { userId: ctx.userId, schoolId, role: { in: STAFF_ROLES } } });
      if (!staff && !ctx.isPlatformAdmin) return ok({ error: "Staff access required" }, 403);
    }

    let title = "";
    let body = "";
    const prompt = input.prompt || "";
    const now = new Date();

    if (input.type === "parent_notification") {
      title = "Parent notification (draft)";
      body = `Dear parents,\n\n${prompt || "[notification message]"}\n\nKind regards,\nThe school office`;
    } else if (input.type === "transport_delay") {
      title = "Transport delay notice (draft)";
      body = `Dear parents,\n\nPlease be aware that ${prompt || "a school transport service"} is currently delayed. We will update you as soon as it arrives. Apologies for any inconvenience.\n\nThe transport team`;
    } else if (input.type === "event_summary") {
      title = "Event summary (draft)";
      const evs = schoolId ? await prisma.calendarEvent.findMany({ where: { schoolId, status: "published", startsAt: { gte: now, lte: new Date(now.getTime() + 7 * 864e5) } }, orderBy: { startsAt: "asc" }, take: 15 }) : [];
      body = `This week at school:\n\n${evs.map((e) => `• ${e.title} — ${new Date(e.startsAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${e.location ? ` @ ${e.location}` : ""}`).join("\n") || "No published events in the next 7 days."}`;
    } else if (input.type === "consent_reminder") {
      title = "Consent reminder (draft)";
      const evs = schoolId ? await prisma.calendarEvent.findMany({ where: { schoolId, consentRequired: true, startsAt: { gte: now } }, orderBy: { startsAt: "asc" }, take: 15 }) : [];
      body = `Dear parents,\n\nOur records show outstanding consent for the following. Please complete these as soon as possible:\n\n${evs.map((e) => `• ${e.title} — ${new Date(e.startsAt).toLocaleDateString("en-GB")}${e.paymentRef ? ` (payment ref ${e.paymentRef})` : ""}`).join("\n") || "[no consent-required events found]"}\n\nThank you,\nThe school office`;
    } else if (input.type === "policy_summary") {
      title = "Policy summary (draft)";
      const doc = input.refId && schoolId ? await prisma.document.findFirst({ where: { id: input.refId, schoolId } }) : null;
      const src = doc?.bodyText || prompt;
      body = doc
        ? `Summary of "${doc.title}":\n\n${(src || "").replace(/\s+/g, " ").slice(0, 600)}${(src || "").length > 600 ? "…" : ""}\n\n(Draft summary — verify against the published policy before sharing.)`
        : `Provide a document reference or paste policy text to summarise.`;
    } else if (input.type === "translation") {
      title = "Translation (draft)";
      const target = LANGUAGES[input.lang || ""] || input.lang || "the target language";
      body = process.env.OPENAI_API_KEY
        ? `[Translation to ${target}]\n\n${prompt}`
        : `[Translation to ${target} requires an AI model key — set OPENAI_API_KEY.]\n\nOriginal:\n${prompt}`;
    }

    const draft = await prisma.aiDraft.create({
      data: { schoolId: schoolId || null, createdById: ctx.userId, type: input.type, title, body, status: "draft", meta: JSON.stringify({ prompt, refId: input.refId, lang: input.lang }) },
    });
    await recordAudit({ action: AUDIT.AI_DRAFT, schoolId: schoolId || null, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "AiDraft", targetId: draft.id, metadata: { type: input.type } });
    return ok({ draft }, 201);
  } catch (err) {
    return handleError(err);
  }
}
