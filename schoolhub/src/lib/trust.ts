import { prisma } from "./db";
import { recordAudit } from "./audit";

// Document Management System (platform / SaaS level) + public Trust Centre.
// Lifecycle: draft → review → approved → published → archived, with version
// history snapshots and an audit trail. Published documents can be surfaced on
// the public Trust Centre, in the mobile app, and to parents (optionally with a
// required acknowledgement).

export const TRUST_CATEGORIES = ["policy", "security", "privacy", "compliance", "terms", "certification", "subprocessor", "other"] as const;
export const TRUST_STATUSES = ["draft", "review", "approved", "published", "archived"] as const;

// Allowed status transitions (super-admin can also jump forward for speed).
const NEXT: Record<string, string[]> = {
  draft: ["review", "published"],
  review: ["approved", "draft"],
  approved: ["published", "review", "draft"],
  published: ["archived", "draft"],
  archived: ["draft"],
};

function slugify(s: string) {
  return (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";
}

async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  let slug = base; let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const hit = await prisma.trustDocument.findUnique({ where: { slug } });
    if (!hit || hit.id === ignoreId) return slug;
    slug = `${base}-${++n}`;
  }
}

async function snapshot(docId: string, note: string, changedById?: string | null) {
  const d = await prisma.trustDocument.findUnique({ where: { id: docId } });
  if (!d) return;
  await prisma.trustDocumentVersion.create({
    data: { documentId: d.id, version: d.version, title: d.title, category: d.category, summary: d.summary, bodyHtml: d.bodyHtml, status: d.status, note, changedById: changedById || null },
  });
}

export async function listTrustDocuments(opts: { status?: string; category?: string; q?: string } = {}) {
  const docs = await prisma.trustDocument.findMany({
    where: {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.q ? { OR: [{ title: { contains: opts.q } }, { summary: { contains: opts.q } }] } : {}),
    },
    include: { versions: { select: { id: true } }, acks: { select: { id: true } } },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  return docs.map((d) => ({
    id: d.id, slug: d.slug, title: d.title, category: d.category, summary: d.summary, version: d.version,
    status: d.status, publicTrust: d.publicTrust, toMobile: d.toMobile, toParents: d.toParents, toAll: (d as any).toAll, requireAck: d.requireAck,
    effectiveDate: d.effectiveDate, reviewDate: d.reviewDate, reviewIntervalDays: (d as any).reviewIntervalDays, reviewOnChange: (d as any).reviewOnChange,
    lastReviewedAt: (d as any).lastReviewedAt, reviewDue: isReviewDue(d),
    ownerName: d.ownerName, linkUrl: d.linkUrl, fileName: d.fileName,
    publishedAt: d.publishedAt, updatedAt: d.updatedAt, versionCount: d.versions.length, ackCount: d.acks.length,
  }));
}

// A published policy is "due for review" once its review interval has elapsed
// since it was last reviewed/published (item A9).
function isReviewDue(d: any): boolean {
  if (d.status !== "published" || !d.reviewIntervalDays) return false;
  const base = d.lastReviewedAt || d.publishedAt || d.updatedAt;
  if (!base) return false;
  return Date.now() - new Date(base).getTime() > d.reviewIntervalDays * 86400000;
}

export async function getTrustDocument(id: string) {
  const d = await prisma.trustDocument.findUnique({
    where: { id },
    include: { versions: { orderBy: { changedAt: "desc" } }, acks: { orderBy: { ackedAt: "desc" }, take: 200 } },
  });
  if (!d) throw new Error("Document not found");
  return d;
}

export async function createTrustDocument(input: any, actorUserId?: string | null) {
  const title = (input.title || "").trim();
  if (!title) throw new Error("title is required");
  const slug = await uniqueSlug(input.slug ? slugify(input.slug) : slugify(title));
  const doc = await prisma.trustDocument.create({
    data: {
      slug, title,
      category: (input.category || "policy").trim(),
      summary: input.summary?.trim() || null,
      bodyHtml: input.bodyHtml || "",
      status: "draft",
      publicTrust: !!input.publicTrust, toMobile: !!input.toMobile, toParents: !!input.toParents, toAll: !!input.toAll, requireAck: !!input.requireAck,
      effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : null,
      reviewDate: input.reviewDate ? new Date(input.reviewDate) : null,
      reviewIntervalDays: input.reviewIntervalDays ? (parseInt(String(input.reviewIntervalDays), 10) || null) : null,
      reviewOnChange: !!input.reviewOnChange,
      ownerName: input.ownerName?.trim() || null,
      linkUrl: input.linkUrl?.trim() || null,
      fileName: input.fileName?.trim() || null,
      createdById: actorUserId || null,
    },
  });
  await snapshot(doc.id, "Created", actorUserId);
  await recordAudit({ action: "TRUST_DOC_CREATED", actorUserId, targetType: "TrustDocument", targetId: doc.id, metadata: { title } });
  return { id: doc.id };
}

export async function updateTrustDocument(id: string, patch: any, actorUserId?: string | null) {
  const doc = await prisma.trustDocument.findUnique({ where: { id } });
  if (!doc) throw new Error("Document not found");
  const data: any = {};
  for (const k of ["title", "category", "summary", "bodyHtml", "ownerName", "linkUrl", "fileName"] as const) {
    if (typeof patch[k] === "string") data[k] = k === "title" ? (patch[k].trim() || doc.title) : (patch[k].trim ? patch[k].trim() || null : patch[k]);
  }
  if (typeof patch.bodyHtml === "string") data.bodyHtml = patch.bodyHtml;
  for (const k of ["publicTrust", "toMobile", "toParents", "toAll", "requireAck", "reviewOnChange"] as const) if (typeof patch[k] === "boolean") data[k] = patch[k];
  if (patch.effectiveDate !== undefined) data.effectiveDate = patch.effectiveDate ? new Date(patch.effectiveDate) : null;
  if (patch.reviewDate !== undefined) data.reviewDate = patch.reviewDate ? new Date(patch.reviewDate) : null;
  if (patch.reviewIntervalDays !== undefined) { const n = parseInt(String(patch.reviewIntervalDays), 10); data.reviewIntervalDays = Number.isFinite(n) && n > 0 ? n : null; }
  if (typeof patch.slug === "string" && patch.slug.trim()) data.slug = await uniqueSlug(slugify(patch.slug), id);

  const contentChanged = ["title", "summary", "bodyHtml", "category"].some((k) => data[k] !== undefined && data[k] !== (doc as any)[k]);
  // Editing a published document is an "update" — bump the version and record it.
  if (contentChanged && doc.status === "published") data.version = doc.version + 1;

  await prisma.trustDocument.update({ where: { id }, data });
  if (contentChanged) await snapshot(id, patch.note?.trim() || "Edited", actorUserId);
  await recordAudit({ action: "TRUST_DOC_UPDATED", actorUserId, targetType: "TrustDocument", targetId: id });
  return { ok: true };
}

export async function transitionTrustDocument(id: string, to: string, actorUserId?: string | null, note?: string) {
  const doc = await prisma.trustDocument.findUnique({ where: { id } });
  if (!doc) throw new Error("Document not found");
  if (!(TRUST_STATUSES as readonly string[]).includes(to)) throw new Error("Unknown status");
  if (to !== doc.status && !(NEXT[doc.status] || []).includes(to)) {
    throw new Error(`Cannot move from ${doc.status} to ${to}`);
  }
  const data: any = { status: to };
  if (to === "published") { data.publishedAt = new Date(); data.archivedAt = null; data.lastReviewedAt = new Date(); }
  if (to === "archived") data.archivedAt = new Date();
  await prisma.trustDocument.update({ where: { id }, data });
  await snapshot(id, note?.trim() || `Status → ${to}`, actorUserId);
  await recordAudit({ action: "TRUST_DOC_STATUS", actorUserId, targetType: "TrustDocument", targetId: id, metadata: { from: doc.status, to } });
  return { ok: true, status: to };
}

export async function deleteTrustDocument(id: string, actorUserId?: string | null) {
  const doc = await prisma.trustDocument.findUnique({ where: { id } });
  if (!doc) throw new Error("Document not found");
  await prisma.trustDocument.delete({ where: { id } });
  await recordAudit({ action: "TRUST_DOC_DELETED", actorUserId, targetType: "TrustDocument", targetId: id, metadata: { title: doc.title } });
  return { ok: true };
}

/** Published documents flagged for the public Trust Centre. No auth required. */
export async function publicTrustDocuments() {
  const docs = await prisma.trustDocument.findMany({
    where: { status: "published", publicTrust: true },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
  return docs.map((d) => ({
    slug: d.slug, title: d.title, category: d.category, summary: d.summary, version: d.version,
    bodyHtml: d.bodyHtml, effectiveDate: d.effectiveDate, linkUrl: d.linkUrl, publishedAt: d.publishedAt,
  }));
}

export async function publicTrustDocument(slug: string) {
  const d = await prisma.trustDocument.findUnique({ where: { slug } });
  if (!d || d.status !== "published" || !d.publicTrust) return null;
  return { slug: d.slug, title: d.title, category: d.category, summary: d.summary, version: d.version, bodyHtml: d.bodyHtml, effectiveDate: d.effectiveDate, linkUrl: d.linkUrl, publishedAt: d.publishedAt };
}

/** Documents surfaced to a signed-in user, with ack state. Includes anything
 *  published to parents OR to all users (so the Policies section works in every
 *  portal). `updatedSinceAck` flags a doc the user accepted at an older version
 *  (item A10 — highlight changes). */
export async function trustDocumentsForUser(userId: string) {
  const docs = await prisma.trustDocument.findMany({
    where: { status: "published", OR: [{ toParents: true }, { toAll: true }] },
    orderBy: [{ requireAck: "desc" }, { title: "asc" }],
  });
  const acks = docs.length
    ? await prisma.trustDocumentAck.findMany({ where: { userId, documentId: { in: docs.map((d) => d.id) } } })
    : [];
  const currentAck = new Set(acks.map((a) => `${a.documentId}:${a.version}`));
  const anyAck = new Set(acks.map((a) => a.documentId));
  const ackAt = new Map(acks.map((a) => [`${a.documentId}:${a.version}`, a.ackedAt]));
  return docs.map((d) => ({
    id: d.id, slug: d.slug, title: d.title, category: d.category, summary: d.summary, version: d.version,
    bodyHtml: d.bodyHtml, linkUrl: d.linkUrl, effectiveDate: d.effectiveDate, requireAck: d.requireAck,
    acknowledged: currentAck.has(`${d.id}:${d.version}`),
    ackedAt: ackAt.get(`${d.id}:${d.version}`) || null,
    updatedSinceAck: !currentAck.has(`${d.id}:${d.version}`) && anyAck.has(d.id),
  }));
}

/** All acceptance records across the platform — Super Admin oversight (item A6). */
export async function allAcknowledgements(opts: { documentId?: string; q?: string } = {}) {
  const acks = await prisma.trustDocumentAck.findMany({
    where: opts.documentId ? { documentId: opts.documentId } : {},
    orderBy: { ackedAt: "desc" }, take: 1000,
  });
  const userIds = Array.from(new Set(acks.map((a) => a.userId)));
  const docIds = Array.from(new Set(acks.map((a) => a.documentId)));
  const [users, docs] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } }) : [],
    docIds.length ? prisma.trustDocument.findMany({ where: { id: { in: docIds } }, select: { id: true, title: true, category: true } }) : [],
  ]);
  const uMap = new Map(users.map((u) => [u.id, u]));
  const dMap = new Map(docs.map((d) => [d.id, d]));
  const rows = acks.map((a) => ({
    id: a.id, ackedAt: a.ackedAt, version: a.version,
    userName: uMap.get(a.userId)?.fullName || null, userEmail: uMap.get(a.userId)?.email || null,
    docTitle: dMap.get(a.documentId)?.title || null, docCategory: dMap.get(a.documentId)?.category || null,
  }));
  const q = opts.q?.trim().toLowerCase();
  return q ? rows.filter((r) => [r.userName, r.userEmail, r.docTitle].some((v) => String(v ?? "").toLowerCase().includes(q))) : rows;
}

export async function acknowledgeTrustDocument(userId: string, documentId: string) {
  const d = await prisma.trustDocument.findUnique({ where: { id: documentId } });
  if (!d || d.status !== "published") throw new Error("Document not available");
  await prisma.trustDocumentAck.upsert({
    where: { documentId_userId_version: { documentId, userId, version: d.version } },
    create: { documentId, userId, version: d.version },
    update: { ackedAt: new Date() },
  });
  await recordAudit({ action: "TRUST_DOC_ACKED", actorUserId: userId, targetType: "TrustDocument", targetId: documentId, metadata: { version: d.version } });
  return { ok: true };
}
