import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";

// Policy documents (uploaded or authored in-system) with metadata that controls
// who sees them. Platform-wide when schoolId is null; otherwise per-school.
// Visible to parents/teachers via the audience field. Documents move through a
// lifecycle (draft → approved → published — set freely) and every save/status
// change writes an immutable PolicyVersion (version history + change audit).

export const POLICY_STATUSES = ["draft", "approved", "published"] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

function normStatus(s?: string | null, publishedFallback?: boolean): PolicyStatus {
  if (s && (POLICY_STATUSES as readonly string[]).includes(s)) return s as PolicyStatus;
  return publishedFallback ? "published" : "draft";
}

/** Write a snapshot of the policy's current state into its version history. */
async function snapshotPolicy(policyId: string, note: string, actorUserId?: string | null): Promise<void> {
  const p = await prisma.policy.findUnique({ where: { id: policyId } });
  if (!p) return;
  await prisma.policyVersion.create({
    data: {
      policyId: p.id, schoolId: p.schoolId, version: p.version, title: p.title, category: p.category,
      audience: p.audience, summary: p.summary, body: p.body, fileUrl: p.fileUrl,
      status: (p as any).status ?? (p.published ? "published" : "draft"), note, changedById: actorUserId ?? null,
    },
  });
}

export async function createPolicy(input: {
  schoolId?: string | null; title: string; category?: string; audience?: string; version?: string;
  summary?: string; body?: string; fileUrl?: string; requireAck?: boolean; effectiveDate?: string;
  published?: boolean; status?: string; actorUserId?: string | null;
}): Promise<{ id: string }> {
  const status = normStatus(input.status, input.published);
  const p = await prisma.policy.create({
    data: {
      schoolId: input.schoolId ?? null, title: input.title, category: input.category ?? "general",
      audience: input.audience ?? "all", version: input.version ?? "1.0",
      summary: input.summary ?? null, body: input.body ?? null, fileUrl: input.fileUrl ?? null,
      requireAck: input.requireAck ?? false, effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : null,
      status, published: status === "published", createdById: input.actorUserId ?? null,
      ...(status === "approved" || status === "published" ? { approvedById: input.actorUserId ?? null, approvedAt: new Date() } : {}),
    },
  });
  await snapshotPolicy(p.id, "Created", input.actorUserId);
  await recordAudit({ action: AUDIT.POLICY_CREATED, schoolId: input.schoolId ?? null, actorUserId: input.actorUserId, targetType: "Policy", targetId: p.id, metadata: { category: p.category, audience: p.audience, status } });
  return { id: p.id };
}

export async function setPolicyPublished(id: string, published: boolean, actor?: { userId?: string | null }): Promise<void> {
  await setPolicyStatus(id, published ? "published" : "draft", actor);
}

/** Move a policy to a lifecycle status (draft/approved/published). Snapshots + audits. */
export async function setPolicyStatus(id: string, status: string, actor?: { userId?: string | null }): Promise<void> {
  const s = normStatus(status);
  const data: any = { status: s, published: s === "published" };
  if (s === "approved" || s === "published") { data.approvedById = actor?.userId ?? null; data.approvedAt = new Date(); }
  const p = await prisma.policy.update({ where: { id }, data });
  await snapshotPolicy(id, `Status → ${s}`, actor?.userId);
  await recordAudit({ action: AUDIT.POLICY_PUBLISHED, schoolId: p.schoolId, actorUserId: actor?.userId, targetType: "Policy", targetId: id, metadata: { status: s, published: data.published } });
}

/** Update a policy's editable fields. Writes a version snapshot after the change. */
export async function updatePolicy(id: string, patch: {
  title?: string; category?: string; audience?: string; version?: string; summary?: string;
  body?: string; fileUrl?: string; requireAck?: boolean; effectiveDate?: string; published?: boolean; status?: string; note?: string;
}, actor?: { userId?: string | null }): Promise<void> {
  const data: any = {};
  for (const k of ["title", "category", "audience", "version", "summary", "body", "fileUrl", "requireAck"] as const) {
    if (patch[k] !== undefined) data[k] = patch[k];
  }
  if (patch.status !== undefined || patch.published !== undefined) {
    const s = normStatus(patch.status, patch.published);
    data.status = s; data.published = s === "published";
    if (s === "approved" || s === "published") { data.approvedById = actor?.userId ?? null; data.approvedAt = new Date(); }
  }
  if (patch.effectiveDate !== undefined) data.effectiveDate = patch.effectiveDate ? new Date(patch.effectiveDate) : null;
  const p = await prisma.policy.update({ where: { id }, data });
  await snapshotPolicy(id, patch.note?.trim() || "Edited", actor?.userId);
  await recordAudit({ action: AUDIT.POLICY_PUBLISHED, schoolId: p.schoolId, actorUserId: actor?.userId, targetType: "Policy", targetId: id, metadata: { updated: Object.keys(data) } });
}

/** List a policy's version history (newest first). */
export async function listPolicyVersions(policyId: string) {
  return prisma.policyVersion.findMany({ where: { policyId }, orderBy: { changedAt: "desc" }, take: 100 });
}

/** Restore a prior version's content onto the live policy (records a new version). */
export async function restorePolicyVersion(policyId: string, versionId: string, actor?: { userId?: string | null }): Promise<void> {
  const v = await prisma.policyVersion.findUnique({ where: { id: versionId } });
  if (!v || v.policyId !== policyId) throw new Error("Version not found for this policy");
  await updatePolicy(policyId, {
    title: v.title, category: v.category, audience: v.audience, version: v.version,
    summary: v.summary ?? undefined, body: v.body ?? undefined, fileUrl: v.fileUrl ?? undefined,
    note: `Restored from version saved ${new Date(v.changedAt).toISOString()}`,
  }, actor);
}

export async function deletePolicy(id: string, actor?: { userId?: string | null }): Promise<void> {
  const p = await prisma.policy.delete({ where: { id } });
  await recordAudit({ action: AUDIT.POLICY_REMOVED, schoolId: p.schoolId, actorUserId: actor?.userId, targetType: "Policy", targetId: id });
}

/** Admin list (all policies in scope). */
export async function listPolicies(opts: { schoolId?: string | null; adminAll?: boolean } = {}) {
  return prisma.policy.findMany({
    where: { ...(opts.schoolId !== undefined ? { schoolId: opts.schoolId } : {}), ...(opts.adminAll ? {} : { published: true }) },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
}

/** Viewer list for a parent/teacher: their school's + platform-wide, published,
 *  filtered to policies whose audience includes them. */
export async function policiesForViewer(schoolId: string, viewer: "parents" | "teachers") {
  return prisma.policy.findMany({
    where: {
      published: true,
      OR: [{ schoolId }, { schoolId: null }],
      audience: { in: ["all", viewer] },
    },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
}
