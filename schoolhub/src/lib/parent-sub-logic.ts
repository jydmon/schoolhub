// Pure logic for parent premium subscriptions — the numbers the super-admin
// dashboard tracks (active count, trialing, MRR, ARR, by-school breakdown).
// Amounts are in minor units (pence). DB flows live in src/lib/crm.ts.
// Unit-tested in tests/crm.test.ts.

export type ParentSubLike = {
  status: string;       // trialing | active | past_due | canceled
  amountMinor: number;
  interval: string;     // month | year
  schoolId?: string | null;
};

const ACTIVE = new Set(["active", "past_due"]); // still billable

/** Monthly recurring revenue contribution of one sub, in minor units. */
export function monthlyMinor(s: ParentSubLike): number {
  if (!ACTIVE.has(s.status)) return 0;
  const amt = Math.max(0, Math.round(s.amountMinor || 0));
  return s.interval === "year" ? Math.round(amt / 12) : amt;
}

export function summarize(subs: ParentSubLike[]) {
  const count = (st: string) => subs.filter((s) => s.status === st).length;
  const active = count("active");
  const trialing = count("trialing");
  const pastDue = count("past_due");
  const canceled = count("canceled");
  const mrrMinor = subs.reduce((sum, s) => sum + monthlyMinor(s), 0);
  const arrMinor = mrrMinor * 12;
  const paying = subs.filter((s) => ACTIVE.has(s.status)).length;
  const arpuMinor = paying > 0 ? Math.round(mrrMinor / paying) : 0;
  return {
    total: subs.length,
    active, trialing, pastDue, canceled, paying,
    mrrMinor, arrMinor, arpuMinor,
    mrr: mrrMinor / 100, arr: arrMinor / 100, arpu: arpuMinor / 100,
  };
}

/** MRR broken down by school (for the platform league table). */
export function bySchool(subs: ParentSubLike[]): { schoolId: string; active: number; mrrMinor: number }[] {
  const map = new Map<string, { active: number; mrrMinor: number }>();
  for (const s of subs) {
    const key = s.schoolId || "unassigned";
    const row = map.get(key) || { active: 0, mrrMinor: 0 };
    if (ACTIVE.has(s.status)) row.active += 1;
    row.mrrMinor += monthlyMinor(s);
    map.set(key, row);
  }
  return Array.from(map.entries())
    .map(([schoolId, v]) => ({ schoolId, ...v }))
    .sort((a, b) => b.mrrMinor - a.mrrMinor);
}

export function formatGBP(minor: number): string {
  return "£" + (minor / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
