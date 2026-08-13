import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { getChildren } from "@/lib/parent";
import { handleError, ok } from "@/lib/http";

// A parent's own subscription view: AI Assistant subscription status,
// subscription management details, linked schools and children across schools.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const [subs, children] = await Promise.all([
      prisma.parentSubscription.findMany({ where: { parentUserId: ctx.userId }, orderBy: { createdAt: "desc" } }),
      getChildren(ctx.userId),
    ]);

    const bySchool = new Map<string, { schoolId: string; schoolName: string; children: string[] }>();
    for (const c of children) {
      const s = (c as any).school;
      if (!bySchool.has(s.id)) bySchool.set(s.id, { schoolId: s.id, schoolName: s.name, children: [] });
      bySchool.get(s.id)!.children.push(`${c.student.firstName} ${c.student.lastName}`.trim());
    }

    const money = (minor: number, ccy: string) => `${ccy === "GBP" ? "£" : ccy + " "}${(minor / 100).toFixed(2)}`;
    const ai = subs.find((s) => s.planKey === "parent_premium") || subs[0] || null;

    return ok({
      aiAssistant: ai
        ? { active: ["active", "trialing"].includes(ai.status), status: ai.status, plan: ai.planKey, interval: ai.interval, price: money(ai.amountMinor, ai.currency), renewalDate: ai.renewalDate }
        : { active: false, status: "none" },
      subscriptions: subs.map((s) => ({ id: s.id, planKey: s.planKey, status: s.status, interval: s.interval, price: money(s.amountMinor, s.currency), renewalDate: s.renewalDate, approvalStatus: s.approvalStatus, schoolId: s.schoolId })),
      schools: Array.from(bySchool.values()).map((x) => ({ id: x.schoolId, name: x.schoolName })),
      childrenBySchool: Array.from(bySchool.values()),
    });
  } catch (err) { return handleError(err); }
}
