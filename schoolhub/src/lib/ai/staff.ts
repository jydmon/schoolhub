import { prisma } from "../db";
import type { Answer } from "./answer";

const has = (q: string, ...words: string[]) => words.every((w) => q.includes(w));
const hasAny = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

/**
 * Answer staff-only operational questions that need computed data rather than
 * document retrieval (consent outstanding, policies due for review, trips today,
 * today's activities). Returns null if the question doesn't match — the caller
 * then falls back to normal retrieval. Only ever called for staff users.
 */
export async function staffAnalytics(question: string, schoolIds: string[], now = new Date()): Promise<Answer | null> {
  const q = question.toLowerCase();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);

  // Policies due for review
  if (has(q, "review") && hasAny(q, "polic", "document", "due")) {
    const soon = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
    const docs = await prisma.document.findMany({
      where: { schoolId: { in: schoolIds }, reviewDate: { lte: soon }, status: { in: ["approved", "published"] } },
      orderBy: { reviewDate: "asc" }, take: 25,
    });
    if (docs.length === 0) return { answer: "No documents are due for review in the next 30 days.", citations: [], found: true };
    const lines = ["Documents due for review (next 30 days):\n", ...docs.map((d) => `• **${d.title}** — review by ${d.reviewDate ? new Date(d.reviewDate).toLocaleDateString("en-GB") : "?"} (${d.status})`)];
    return { answer: lines.join("\n"), citations: docs.map((d) => ({ title: d.title, type: "document", source: "Knowledge Hub", date: d.reviewDate, url: null })), found: true };
  }

  // Outstanding consent
  if (has(q, "consent") && hasAny(q, "not", "outstanding", "missing", "complete", "haven")) {
    const events = await prisma.calendarEvent.findMany({
      where: { schoolId: { in: schoolIds }, consentRequired: true, startsAt: { gte: startOfDay } },
      include: { _count: { select: { consents: true, students: true } } }, orderBy: { startsAt: "asc" }, take: 25,
    });
    if (events.length === 0) return { answer: "There are no upcoming events that require consent.", citations: [], found: true };
    const lines = ["Upcoming consent-required events and responses recorded so far:\n",
      ...events.map((e) => `• **${e.title}** (${new Date(e.startsAt).toLocaleDateString("en-GB")}) — ${e._count.consents} consent response(s) recorded${e._count.students ? `, ${e._count.students} named participant(s)` : ""}.`)];
    lines.push("\n_Tip: use the AI drafting tool to draft a reminder for outstanding consent._");
    return { answer: lines.join("\n"), citations: events.map((e) => ({ title: e.title, type: "event", source: "School calendar", date: e.startsAt, url: null })), found: true };
  }

  // Trips today / activities today
  if ((has(q, "trip") && hasAny(q, "today", "happening")) || has(q, "activities", "today") || has(q, "today", "school")) {
    const cat = has(q, "trip") ? { category: "trip" } : {};
    const events = await prisma.calendarEvent.findMany({
      where: { schoolId: { in: schoolIds }, status: { not: "cancelled" }, startsAt: { gte: startOfDay, lte: endOfDay }, ...cat },
      orderBy: { startsAt: "asc" }, take: 25,
    });
    const noun = has(q, "trip") ? "trips" : "activities";
    if (events.length === 0) return { answer: `There are no ${noun} scheduled for today.`, citations: [], found: true };
    const lines = [`Today's ${noun}:\n`, ...events.map((e) => `• **${e.title}** — ${new Date(e.startsAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}${e.location ? ` @ ${e.location}` : ""}`)];
    return { answer: lines.join("\n"), citations: events.map((e) => ({ title: e.title, type: "event", source: "School calendar", date: e.startsAt, url: null })), found: true };
  }

  // Transport incidents / bus delays — no live transport module yet (honest answer).
  if (hasAny(q, "bus", "coach", "transport") && hasAny(q, "delay", "incident", "late")) {
    return { answer: "Live transport tracking (bus/coach delays and incidents) isn't available yet — that arrives with the Transport module. I can't see real-time vehicle data, so I won't guess.", citations: [], found: false };
  }

  return null;
}
