import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { REWARD_TYPE_LABELS } from "@/lib/constants";
import { guardianCanSeeBehaviour } from "@/lib/integration/behaviour-logic";
import { handleError, ok } from "@/lib/http";

// Parent reward & behaviour dashboard — own children only.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const links = await prisma.guardianLink.findMany({ where: { parentUserId: ctx.userId }, include: { student: { select: { id: true, firstName: true, lastName: true } } } });
    const rules = await prisma.homeRewardRule.findMany({ where: { guardianUserId: ctx.userId, active: true }, orderBy: { threshold: "asc" } });

    const termStart = new Date(Date.now() - 90 * 864e5);
    const children = [] as any[];
    for (const l of links) {
      // Respect a guardian's behaviour info-restriction: don't surface behaviour data.
      let restrictions: string[] = [];
      try { restrictions = JSON.parse((l as { infoRestrictions?: string }).infoRestrictions || "[]"); } catch { /* ignore */ }
      if (!guardianCanSeeBehaviour(restrictions)) {
        children.push({ studentId: l.student.id, name: `${l.student.firstName} ${l.student.lastName}`, points: 0, sources: [], recent: [], incidents: [], trend: [0, 0, 0, 0, 0, 0], milestone: null, restricted: true });
        continue;
      }
      const records = await prisma.rewardRecord.findMany({ where: { studentId: l.student.id, at: { gte: termStart } }, orderBy: { at: "desc" }, take: 100 });
      const points = records.filter((r) => r.positive).reduce((n, r) => n + r.points, 0);
      const incidents = records.filter((r) => ["incident", "detention", "sanction"].includes(r.type));
      const childRules = rules.filter((r) => r.studentId === l.student.id);
      const nextRule = childRules.find((r) => r.threshold > points);
      // weekly points trend (last 6 weeks)
      const trend: number[] = [];
      for (let w = 5; w >= 0; w--) {
        const from = new Date(Date.now() - (w + 1) * 7 * 864e5), to = new Date(Date.now() - w * 7 * 864e5);
        trend.push(records.filter((r) => r.positive && r.at >= from && r.at < to).reduce((n, r) => n + r.points, 0));
      }
      children.push({
        studentId: l.student.id,
        name: `${l.student.firstName} ${l.student.lastName}`,
        points,
        sources: Array.from(new Set(records.map((r) => r.source))),
        recent: records.slice(0, 8).map((r) => ({ type: r.type, label: REWARD_TYPE_LABELS[r.type] || r.type, points: r.points, note: r.note, teacher: r.teacherName, positive: r.positive, at: r.at })),
        incidents: incidents.slice(0, 8).map((r) => ({ label: REWARD_TYPE_LABELS[r.type] || r.type, note: r.note, at: r.at })),
        trend,
        milestone: nextRule ? { reward: nextRule.reward, threshold: nextRule.threshold, remaining: Math.max(0, nextRule.threshold - points), progress: Math.min(1, points / nextRule.threshold) } : null,
      });
    }
    return ok({ children });
  } catch (err) { return handleError(err); }
}
