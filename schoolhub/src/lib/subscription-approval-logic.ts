// Pure logic for subscription renewal reporting + the manual-approval override.
// Works on any subscription-like record (school or parent). Handles days-until-
// renewal, reminder scheduling, and the auto-vs-manual approval decision. DB
// flows live in src/lib/subscriptions-admin.ts. Unit-tested in tests/phase17b.test.ts.

export type SubLike = {
  status: string;            // trialing | active | past_due | canceled | ...
  renewalDate?: Date | string | null;
  approvalMode?: string;     // auto | manual
  approvalStatus?: string;   // approved | pending | rejected
  reminderSentAt?: Date | string | null;
};

const DAY = 24 * 60 * 60 * 1000;

/** Whole days until renewal (negative if overdue); null if no renewal date. */
export function daysUntilRenewal(sub: SubLike, now: Date): number | null {
  if (!sub.renewalDate) return null;
  return Math.ceil((new Date(sub.renewalDate).getTime() - now.getTime()) / DAY);
}

/** Reminder cadence: a reminder is due at 30, 14, 7 and 1 days before renewal,
 *  and once overdue — but not if one was already sent within the last 24h. */
export const REMINDER_THRESHOLDS = [30, 14, 7, 1];

export function reminderDue(sub: SubLike, now: Date): boolean {
  if (sub.status === "canceled") return false;
  const d = daysUntilRenewal(sub, now);
  if (d === null) return false;
  const withinWindow = d <= 0 || REMINDER_THRESHOLDS.includes(d);
  if (!withinWindow) return false;
  if (sub.reminderSentAt && now.getTime() - new Date(sub.reminderSentAt).getTime() < DAY) return false;
  return true;
}

/** The most urgent reminder label for reporting. */
export function reminderLabel(sub: SubLike, now: Date): string | null {
  const d = daysUntilRenewal(sub, now);
  if (d === null) return null;
  if (d < 0) return `Overdue by ${Math.abs(d)}d`;
  if (d === 0) return "Renews today";
  if (d <= 1) return "Renews tomorrow";
  if (d <= 7) return `Renews in ${d}d`;
  if (d <= 14) return `Renews in ${d}d`;
  if (d <= 30) return `Renews in ${d}d`;
  return null;
}

/** Renewal readiness. In auto mode a due renewal proceeds; in manual mode it is
 *  held as "pending" until a platform admin approves. */
export function canAutoRenew(sub: SubLike, now: Date): { renew: boolean; reason: string } {
  const d = daysUntilRenewal(sub, now);
  const due = d !== null && d <= 0;
  if (!due) return { renew: false, reason: "not due" };
  if ((sub.approvalMode ?? "auto") === "manual") {
    if (sub.approvalStatus === "approved") return { renew: true, reason: "manually approved" };
    return { renew: false, reason: "awaiting manual approval" };
  }
  return { renew: true, reason: "auto-approved" };
}

/** Does this subscription need a human decision right now? */
export function needsManualApproval(sub: SubLike, now: Date): boolean {
  const d = daysUntilRenewal(sub, now);
  const dueSoon = d !== null && d <= 7;
  return (sub.approvalMode ?? "auto") === "manual" && sub.approvalStatus !== "approved" && dueSoon && sub.status !== "canceled";
}

/** Portfolio report over many subscriptions (for the super-admin dashboard). */
export function reportSummary(subs: SubLike[], now: Date) {
  let dueSoon = 0, overdue = 0, pendingApproval = 0, remindersDue = 0;
  for (const s of subs) {
    const d = daysUntilRenewal(s, now);
    if (d !== null && d < 0 && s.status !== "canceled") overdue++;
    else if (d !== null && d <= 30 && d >= 0 && s.status !== "canceled") dueSoon++;
    if (needsManualApproval(s, now)) pendingApproval++;
    if (reminderDue(s, now)) remindersDue++;
  }
  return { total: subs.length, dueSoon, overdue, pendingApproval, remindersDue };
}
