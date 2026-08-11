import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";

// Policy documents (uploaded or authored in-system) with metadata that controls
// who sees them. Platform-wide when schoolId is null; otherwise per-school.
// Visible to parents/teachers via the audience field.

export async function createPolicy(input: {
  schoolId?: string | null; title: string; category?: string; audience?: string; version?: string;
  summary?: string; body?: string; fileUrl?: string; requireAck?: boolean; effectiveDate?: string;
  published?: boolean; actorUserId?: string | null;
}): Promise<{ id: string }> {
  const p = await prisma.policy.create({
    data: {
      schoolId: input.schoolId ?? null, title: input.title, category: input.category ?? "general",
      audience: input.audience ?? "all", version: input.version ?? "1.0",
      summary: input.summary ?? null, body: input.body ?? null, fileUrl: input.fileUrl ?? null,
      requireAck: input.requireAck ?? false, effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : null,
      published: input.published ?? false, createdById: input.actorUserId ?? null,
    },
  });
  await recordAudit({ action: AUDIT.POLICY_CREATED, schoolId: input.schoolId ?? null, actorUserId: input.actorUserId, targetType: "Policy", targetId: p.id, metadata: { category: p.category, audience: p.audience } });
  return { id: p.id };
}

export async function setPolicyPublished(id: string, published: boolean, actor?: { userId?: string | null }): Promise<void> {
  const p = await prisma.policy.update({ where: { id }, data: { published } });
  await recordAudit({ action: AUDIT.POLICY_PUBLISHED, schoolId: p.schoolId, actorUserId: actor?.userId, targetType: "Policy", targetId: id, metadata: { published } });
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
