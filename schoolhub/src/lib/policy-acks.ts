import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";
import { annotateForViewer, ackStatus, type PolicyLike, type AckLike } from "./policy-ack-logic";

// Data layer for policy acknowledgements. Records a parent/teacher accepting a
// policy at its current version (idempotent), lists policies for a viewer with
// ack state, and rolls up acknowledgement status for the admin view. Pure rules
// live in policy-ack-logic.ts.

/** Record (or no-op) an acknowledgement of the policy's current version. */
export async function acknowledgePolicy(input: { policyId: string; userId: string; role?: string; schoolId?: string | null }): Promise<{ acknowledged: boolean; version: string }> {
  const policy = await prisma.policy.findUnique({ where: { id: input.policyId } });
  if (!policy) throw new Error("policy not found");
  if (!policy.published) throw new Error("policy not published");
  await prisma.policyAck.upsert({
    where: { policyId_userId_version: { policyId: policy.id, userId: input.userId, version: policy.version } },
    update: { acknowledgedAt: new Date() },
    create: { policyId: policy.id, userId: input.userId, role: input.role ?? null, version: policy.version, schoolId: input.schoolId ?? policy.schoolId ?? null },
  });
  await recordAudit({ action: AUDIT.POLICY_ACKNOWLEDGED, schoolId: policy.schoolId, actorUserId: input.userId, targetType: "Policy", targetId: policy.id, metadata: { version: policy.version } });
  return { acknowledged: true, version: policy.version };
}

/** Policies a viewer should see, annotated with their acknowledgement state. */
export async function viewerPoliciesWithAck(schoolId: string, user: { userId: string; roles: string[] }) {
  const viewer = user.roles.includes("Teacher") ? "teachers" : "parents";
  const policies = await prisma.policy.findMany({
    where: { published: true, OR: [{ schoolId }, { schoolId: null }], audience: { in: ["all", viewer] } },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
  const acks = await prisma.policyAck.findMany({ where: { userId: user.userId, policyId: { in: policies.map((p) => p.id) } } });
  const annotated = annotateForViewer(policies as unknown as PolicyLike[], acks as unknown as AckLike[], user);
  // Merge the annotation flags back onto the full policy rows.
  const flagById = new Map(annotated.map((a) => [a.id, a]));
  return policies.map((p) => ({ ...p, acknowledged: flagById.get(p.id)?.acknowledged ?? false, actionRequired: flagById.get(p.id)?.actionRequired ?? false }));
}

/** Admin rollup: acknowledgement % for one policy across its audience. */
export async function policyAckStatus(policyId: string) {
  const policy = await prisma.policy.findUnique({ where: { id: policyId } });
  if (!policy) throw new Error("policy not found");

  // Resolve the audience user ids for the policy's school.
  const audienceUserIds = await audienceUsers(policy.schoolId, policy.audience);
  const acks = await prisma.policyAck.findMany({ where: { policyId } });
  return ackStatus(policy as unknown as PolicyLike, audienceUserIds, acks as unknown as AckLike[]);
}

export async function audienceUsers(schoolId: string | null, audience: string): Promise<string[]> {
  if (!schoolId) {
    // Platform-wide policy: approximate audience by role across all schools.
    const roles = audience === "teachers" ? ["Teacher"] : audience === "parents" ? ["Parent"] : ["Parent", "Teacher"];
    const ms = await prisma.membership.findMany({ where: { role: { in: roles } }, select: { userId: true } });
    return Array.from(new Set(ms.map((m) => m.userId)));
  }
  if (audience === "parents" || audience === "all") {
    const links = await prisma.guardianLink.findMany({ where: { schoolId }, select: { parentUserId: true } });
    const parents = new Set(links.map((l) => l.parentUserId));
    if (audience === "parents") return Array.from(parents);
    const teachers = await prisma.membership.findMany({ where: { schoolId, role: "Teacher" }, select: { userId: true } });
    teachers.forEach((t) => parents.add(t.userId));
    return Array.from(parents);
  }
  const roles = audience === "teachers" ? ["Teacher"] : ["SchoolAdministrator", "SchoolLeader", "SupportStaff", "Teacher"];
  const ms = await prisma.membership.findMany({ where: { schoolId, role: { in: roles } }, select: { userId: true } });
  return Array.from(new Set(ms.map((m) => m.userId)));
}
