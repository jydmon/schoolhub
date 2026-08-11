import { prisma } from "../db";
import { REWARD_TYPE_LABELS } from "../constants";
import type { Answer } from "./answer";

const hasAny = (q: string, ...w: string[]) => w.some((x) => q.includes(x));

/**
 * Answer parent reward/behaviour questions from the family's own records
 * (points, achievements, detentions, home-reward milestones, behaviour trend).
 * Returns null if the question doesn't match — caller falls back to retrieval.
 */
export async function parentRewardAnalytics(userId: string, question: string): Promise<Answer | null> {
  const q = question.toLowerCase();
  if (!hasAny(q, "point", "reward", "detention", "behaviour", "behavior", "achievement", "badge", "merit", "milestone", "trend", "close")) return null;

  const links = await prisma.guardianLink.findMany({ where: { parentUserId: userId }, include: { student: { select: { id: true, firstName: true, lastName: true } } } });
  if (links.length === 0) return null;
  const termStart = new Date(Date.now() - 90 * 864e5);
  const monthStart = new Date(Date.now() - 30 * 864e5);
  const rules = await prisma.homeRewardRule.findMany({ where: { guardianUserId: userId, active: true }, orderBy: { threshold: "asc" } });

  const lines: string[] = [];
  const citations: any[] = [];
  for (const l of links) {
    const recs = await prisma.rewardRecord.findMany({ where: { studentId: l.student.id, at: { gte: termStart } }, orderBy: { at: "desc" } });
    const name = l.student.firstName;
    const points = recs.filter((r) => r.positive).reduce((n, r) => n + r.points, 0);
    if (recs.length) citations.push({ title: `${name}'s records`, source: recs[0].source, date: recs[0].at });

    if (hasAny(q, "detention", "why")) {
      const dets = recs.filter((r) => r.type === "detention" || r.type === "sanction");
      lines.push(dets.length ? `${name}: ${dets.map((d) => `${REWARD_TYPE_LABELS[d.type]} on ${new Date(d.at).toLocaleDateString("en-GB")}${d.note ? ` — ${d.note}` : ""}${d.teacherName ? ` (${d.teacherName})` : ""}`).join("; ")}.` : `${name}: no detentions or sanctions recorded this term.`);
    } else if (hasAny(q, "close", "milestone")) {
      const next = rules.filter((r) => r.studentId === l.student.id).find((r) => r.threshold > points);
      lines.push(next ? `${name} has ${points} points — ${next.threshold - points} to go for your home reward "${next.reward}" (${next.threshold}).` : `${name} has ${points} points. No active home reward rule is set above this yet.`);
    } else if (hasAny(q, "trend", "behaviour", "behavior")) {
      const pos = recs.filter((r) => r.positive).length, neg = recs.filter((r) => !r.positive).length;
      lines.push(`${name} this term: ${points} points across ${pos} positive record(s) and ${neg} behaviour record(s).`);
    } else if (hasAny(q, "month", "received", "achievement", "badge")) {
      const month = recs.filter((r) => r.positive && r.at >= monthStart);
      lines.push(`${name} this month: ${month.map((r) => REWARD_TYPE_LABELS[r.type]).join(", ") || "no rewards recorded"}.`);
    } else {
      lines.push(`${name} has earned ${points} points this term.`);
    }
  }

  return {
    answer: `${lines.join("\n")}\n\n_Source: your school's behaviour/reward records (family view). Home reward rules are private to your family._`,
    citations, found: true,
  };
}
