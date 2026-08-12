import { prisma } from "./db";
import { audienceUsers } from "./policy-acks";
import { ROLE_LABELS } from "./constants";

// Platform-wide policy compliance: for every published, mandatory policy, who is
// in scope, who has acknowledged the CURRENT version, and who is outstanding —
// rolled up by policy, by role and by school for the super-admin dashboard.
export async function policyCompliance() {
  const policies = await prisma.policy.findMany({ where: { published: true, requireAck: true }, orderBy: { title: "asc" } });
  const schools = await prisma.school.findMany({ select: { id: true, name: true } });
  const schoolName = new Map(schools.map((s) => [s.id, s.name]));

  const audCache = new Map<string, string[]>();
  const audienceFor = async (schoolId: string | null, audience: string) => {
    const key = `${schoolId ?? "_"}:${audience}`;
    if (!audCache.has(key)) audCache.set(key, await audienceUsers(schoolId, audience));
    return audCache.get(key)!;
  };

  const summaries: any[] = [];
  const outstandingPairs: { userId: string; policyId: string; title: string; version: string; schoolId: string | null }[] = [];

  for (const p of policies) {
    const uids = await audienceFor(p.schoolId, p.audience);
    const acks = await prisma.policyAck.findMany({ where: { policyId: p.id, version: p.version }, select: { userId: true } });
    const accepted = new Set(acks.map((a) => a.userId));
    const out = uids.filter((u) => !accepted.has(u));
    summaries.push({
      policyId: p.id, title: p.title, version: p.version, category: p.category, audience: p.audience,
      scope: p.schoolId ? (schoolName.get(p.schoolId) || "School") : "Platform-wide",
      audienceCount: uids.length, acceptedCount: uids.length - out.length, outstandingCount: out.length,
      rate: uids.length ? Math.round(((uids.length - out.length) / uids.length) * 100) : 100,
    });
    for (const u of out) outstandingPairs.push({ userId: u, policyId: p.id, title: p.title, version: p.version, schoolId: p.schoolId });
  }

  // Batch-load the outstanding users + their memberships for role/school context.
  const uniqUserIds = Array.from(new Set(outstandingPairs.map((o) => o.userId)));
  const users = await prisma.user.findMany({ where: { id: { in: uniqUserIds } }, select: { id: true, fullName: true, email: true, memberships: { select: { schoolId: true, role: true } } } });
  const userById = new Map(users.map((u) => [u.id, u]));

  const roleFor = (u: any, schoolId: string | null) => {
    const ms: any[] = u?.memberships ?? [];
    const m = (schoolId && ms.find((x) => x.schoolId === schoolId)) || ms[0];
    return m?.role || "Parent";
  };

  const byRole: Record<string, number> = {};
  const bySchool: Record<string, number> = {};
  const rows = outstandingPairs.slice(0, 3000).map((o) => {
    const u = userById.get(o.userId);
    const role = roleFor(u, o.schoolId);
    const school = o.schoolId ? (schoolName.get(o.schoolId) || "School") : "Platform-wide";
    byRole[ROLE_LABELS[role] || role] = (byRole[ROLE_LABELS[role] || role] || 0) + 1;
    bySchool[school] = (bySchool[school] || 0) + 1;
    return { name: u?.fullName || "Unknown", email: u?.email || "", role: ROLE_LABELS[role] || role, school, policy: o.title, version: o.version };
  });

  const totalOutstanding = outstandingPairs.length;
  return {
    summaries,
    outstanding: rows,
    totalOutstanding,
    byRole: Object.entries(byRole).map(([k, v]) => ({ role: k, count: v })).sort((a, b) => b.count - a.count),
    bySchool: Object.entries(bySchool).map(([k, v]) => ({ school: k, count: v })).sort((a, b) => b.count - a.count),
  };
}
