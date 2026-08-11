// Pure logic for policy acknowledgements. When a policy requires acknowledgement,
// each parent/teacher in its audience must accept it — and re-accept when the
// version changes. This module decides who still needs to acknowledge and rolls
// up acknowledgement status. DB flows live in src/lib/policy-acks.ts.
// Unit-tested in tests/phase17d.test.ts.

export type PolicyLike = {
  id: string;
  version: string;
  requireAck: boolean;
  audience: string; // all | parents | teachers | staff
  published?: boolean;
};

export type AckLike = {
  policyId: string;
  userId: string;
  version: string;
  acknowledgedAt: Date | string;
};

const ROLE_TO_AUDIENCE: Record<string, string> = {
  Parent: "parents",
  Teacher: "teachers",
  SchoolAdministrator: "staff",
  SchoolLeader: "staff",
  SupportStaff: "staff",
};

/** Does a policy apply to a viewer with these roles? */
export function policyAppliesTo(policy: PolicyLike, roles: string[]): boolean {
  if (policy.audience === "all") return true;
  return roles.some((r) => ROLE_TO_AUDIENCE[r] === policy.audience);
}

/** Has this user acknowledged the CURRENT version of the policy? */
export function hasAcknowledged(policy: PolicyLike, acks: AckLike[], userId: string): boolean {
  return acks.some((a) => a.policyId === policy.id && a.userId === userId && a.version === policy.version);
}

/** Does this user still need to acknowledge the policy right now? */
export function needsAck(policy: PolicyLike, acks: AckLike[], user: { userId: string; roles: string[] }): boolean {
  if (!policy.requireAck || policy.published === false) return false;
  if (!policyAppliesTo(policy, user.roles)) return false;
  return !hasAcknowledged(policy, acks, user.userId);
}

/** Annotate a list of policies for a viewer with ack state (for the parent UI). */
export function annotateForViewer(policies: PolicyLike[], acks: AckLike[], user: { userId: string; roles: string[] }) {
  return policies
    .filter((p) => policyAppliesTo(p, user.roles))
    .map((p) => ({
      ...p,
      acknowledged: hasAcknowledged(p, acks, user.userId),
      actionRequired: needsAck(p, acks, user),
    }));
}

/** Acknowledgement rollup for one policy across an audience (for the admin UI).
 *  `audienceUserIds` is everyone the policy applies to; acks are all rows for it. */
export function ackStatus(policy: PolicyLike, audienceUserIds: string[], acks: AckLike[]) {
  const total = audienceUserIds.length;
  if (!policy.requireAck) {
    return { requireAck: false, total, acknowledged: 0, pending: 0, pct: 100, pendingUserIds: [] as string[] };
  }
  const acked = new Set(acks.filter((a) => a.policyId === policy.id && a.version === policy.version).map((a) => a.userId));
  const acknowledged = audienceUserIds.filter((u) => acked.has(u)).length;
  const pendingUserIds = audienceUserIds.filter((u) => !acked.has(u));
  const pct = total > 0 ? Math.round((acknowledged / total) * 100) : 100;
  return { requireAck: true, total, acknowledged, pending: pendingUserIds.length, pct, pendingUserIds };
}
