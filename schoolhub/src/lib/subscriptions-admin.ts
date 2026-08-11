import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";
import { reportSummary, reminderLabel, daysUntilRenewal, needsManualApproval, type SubLike } from "./subscription-approval-logic";

// Subscription reporting + manual-approval override for the super-admin
// dashboard. Covers both tenant (school) subscriptions and parent premium
// subscriptions. Pure maths live in subscription-approval-logic.ts.

/** Full reporting view: KPIs + a per-subscription table with due dates,
 *  reminder labels and which ones need a manual approval decision. */
export async function subscriptionReport(now = new Date()) {
  const schoolSubs = await prisma.subscription.findMany({ include: { plan: true, school: { select: { name: true } } } });
  const parentSubs = await prisma.parentSubscription.findMany();

  const schoolRows = schoolSubs.map((s) => ({
    id: s.id, type: "school" as const, who: s.school?.name ?? s.schoolId,
    plan: s.plan?.name ?? "—", status: s.status,
    renewalDate: s.renewalDate, daysUntil: daysUntilRenewal(s as SubLike, now),
    reminder: reminderLabel(s as SubLike, now),
    approvalMode: s.approvalMode, approvalStatus: s.approvalStatus,
    needsApproval: needsManualApproval(s as SubLike, now),
  }));
  const parentRows = parentSubs.map((s) => ({
    id: s.id, type: "parent" as const, who: s.parentUserId,
    plan: s.planKey, status: s.status,
    renewalDate: s.renewalDate, daysUntil: daysUntilRenewal(s as SubLike, now),
    reminder: reminderLabel(s as SubLike, now),
    approvalMode: s.approvalMode, approvalStatus: s.approvalStatus,
    needsApproval: needsManualApproval(s as SubLike, now),
  }));

  const summary = reportSummary([...schoolSubs, ...parentSubs] as SubLike[], now);
  return { summary, schools: schoolRows, parents: parentRows };
}

/** Set the renewal approval mode (auto vs manual) for a subscription. */
export async function setApprovalMode(type: "school" | "parent", id: string, mode: "auto" | "manual", actor?: { userId?: string | null }): Promise<void> {
  const data = { approvalMode: mode, approvalStatus: mode === "manual" ? "pending" : "approved" };
  if (type === "school") await prisma.subscription.update({ where: { id }, data });
  else await prisma.parentSubscription.update({ where: { id }, data });
  await recordAudit({ action: AUDIT.SUB_APPROVAL_CHANGED, actorUserId: actor?.userId, targetType: type === "school" ? "Subscription" : "ParentSubscription", targetId: id, metadata: { mode } });
}

/** Approve or reject a held renewal (manual-approval override). */
export async function decideApproval(type: "school" | "parent", id: string, decision: "approved" | "rejected", actor?: { userId?: string | null }): Promise<void> {
  const data = { approvalStatus: decision, approvedByUserId: actor?.userId ?? null, approvedAt: new Date() };
  if (type === "school") await prisma.subscription.update({ where: { id }, data });
  else await prisma.parentSubscription.update({ where: { id }, data });
  await recordAudit({ action: AUDIT.SUB_APPROVAL_CHANGED, actorUserId: actor?.userId, targetType: type === "school" ? "Subscription" : "ParentSubscription", targetId: id, metadata: { decision } });
}

/** Mark a reminder as sent (idempotency for the reminder cron). */
export async function markReminderSent(type: "school" | "parent", id: string): Promise<void> {
  const data = { reminderSentAt: new Date() };
  if (type === "school") await prisma.subscription.update({ where: { id }, data });
  else await prisma.parentSubscription.update({ where: { id }, data });
}
