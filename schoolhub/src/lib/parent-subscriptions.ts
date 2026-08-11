import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";
import { summarize, bySchool, formatGBP } from "./parent-sub-logic";

// Parent premium subscriptions (e.g. the AI assistant). Billing is handled by
// Stripe — only opaque Stripe references are stored, never card data. These
// records feed the super-admin dashboard for platform-wide tracking. Summary
// maths live in parent-sub-logic.ts (unit-tested).

export async function upsertParentSubscription(input: {
  parentUserId: string; schoolId?: string | null; planKey?: string; status?: string;
  amountMinor?: number; currency?: string; interval?: string;
  stripeCustomerRef?: string; stripeSubRef?: string; actorUserId?: string | null;
}): Promise<{ id: string }> {
  const planKey = input.planKey ?? "parent_premium";
  const status = input.status ?? "trialing";
  const renewalDate = status === "active"
    ? new Date(Date.now() + (input.interval === "year" ? 365 : 30) * 24 * 60 * 60 * 1000)
    : null;

  const sub = await prisma.parentSubscription.upsert({
    where: { parentUserId_planKey: { parentUserId: input.parentUserId, planKey } },
    update: {
      schoolId: input.schoolId ?? null,
      status,
      amountMinor: input.amountMinor ?? 0,
      currency: input.currency ?? "GBP",
      interval: input.interval ?? "month",
      stripeCustomerRef: input.stripeCustomerRef ?? null,
      stripeSubRef: input.stripeSubRef ?? null,
      renewalDate,
      canceledAt: status === "canceled" ? new Date() : null,
    },
    create: {
      parentUserId: input.parentUserId,
      schoolId: input.schoolId ?? null,
      planKey, status,
      amountMinor: input.amountMinor ?? 0,
      currency: input.currency ?? "GBP",
      interval: input.interval ?? "month",
      stripeCustomerRef: input.stripeCustomerRef ?? null,
      stripeSubRef: input.stripeSubRef ?? null,
      renewalDate,
    },
  });
  await recordAudit({ action: AUDIT.PARENT_SUB_CHANGED, schoolId: input.schoolId ?? null, actorUserId: input.actorUserId, targetType: "ParentSubscription", targetId: sub.id, metadata: { planKey, status } });
  return { id: sub.id };
}

/** Platform-wide tracking view for the super-admin dashboard. */
export async function platformParentSubSummary() {
  const subs = await prisma.parentSubscription.findMany({
    select: { status: true, amountMinor: true, interval: true, schoolId: true },
  });
  const totals = summarize(subs);
  const perSchoolRaw = bySchool(subs);

  // Attach school names for the league table (skip the "unassigned" bucket).
  const ids = perSchoolRaw.map((r) => r.schoolId).filter((id) => id !== "unassigned");
  const schools = ids.length ? await prisma.school.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nameById = new Map(schools.map((s) => [s.id, s.name]));
  const perSchool = perSchoolRaw.map((r) => ({
    schoolId: r.schoolId,
    schoolName: r.schoolId === "unassigned" ? "Unassigned" : (nameById.get(r.schoolId) ?? r.schoolId),
    active: r.active,
    mrrMinor: r.mrrMinor,
    mrr: formatGBP(r.mrrMinor),
  }));

  return { ...totals, mrrFormatted: formatGBP(totals.mrrMinor), arrFormatted: formatGBP(totals.arrMinor), perSchool };
}

/** Per-school parent-subscription view (for a tenant admin). */
export async function schoolParentSubSummary(schoolId: string) {
  const subs = await prisma.parentSubscription.findMany({
    where: { schoolId },
    select: { status: true, amountMinor: true, interval: true, schoolId: true },
  });
  const totals = summarize(subs);
  return { ...totals, mrrFormatted: formatGBP(totals.mrrMinor) };
}
