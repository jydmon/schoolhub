import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";

// Content management for how-to / onboarding videos surfaced in the Help Centre.
// schoolId null => platform-wide (visible to every school). Video bytes live in
// object storage in production; here we store the hosted URL / storage reference
// plus metadata and an optional transcript (which powers AI help search).

export async function createVideo(input: {
  title: string; description?: string; category?: string; audience?: string;
  url: string; thumbnailUrl?: string; durationSec?: number; transcript?: string;
  sequence?: number; published?: boolean; schoolId?: string | null; actorUserId?: string | null;
}): Promise<{ id: string }> {
  const v = await prisma.helpVideo.create({
    data: {
      schoolId: input.schoolId ?? null,
      title: input.title,
      description: input.description ?? null,
      category: input.category ?? "getting_started",
      audience: input.audience ?? "all",
      url: input.url,
      thumbnailUrl: input.thumbnailUrl ?? null,
      durationSec: input.durationSec ?? 0,
      transcript: input.transcript ?? null,
      sequence: input.sequence ?? 0,
      published: input.published ?? false,
      createdById: input.actorUserId ?? null,
    },
  });
  await recordAudit({ action: AUDIT.VIDEO_CREATED, schoolId: input.schoolId ?? null, actorUserId: input.actorUserId, targetType: "HelpVideo", targetId: v.id, metadata: { title: input.title, category: v.category } });
  return { id: v.id };
}

export async function setVideoPublished(id: string, published: boolean, actor?: { userId?: string | null }): Promise<void> {
  const v = await prisma.helpVideo.update({ where: { id }, data: { published } });
  await recordAudit({ action: AUDIT.VIDEO_PUBLISHED, schoolId: v.schoolId, actorUserId: actor?.userId, targetType: "HelpVideo", targetId: id, metadata: { published } });
}

export async function removeVideo(id: string, actor?: { userId?: string | null }): Promise<void> {
  const v = await prisma.helpVideo.delete({ where: { id } });
  await recordAudit({ action: AUDIT.VIDEO_REMOVED, schoolId: v.schoolId, actorUserId: actor?.userId, targetType: "HelpVideo", targetId: id });
}

/** Update an existing video's editable fields. */
export async function updateVideo(id: string, patch: {
  title?: string; description?: string; category?: string; audience?: string; url?: string; published?: boolean;
}, actor?: { userId?: string | null }): Promise<void> {
  const data: any = {};
  for (const k of ["title", "description", "category", "audience", "url", "published"] as const) {
    if (patch[k] !== undefined) data[k] = patch[k];
  }
  const v = await prisma.helpVideo.update({ where: { id }, data });
  await recordAudit({ action: AUDIT.VIDEO_PUBLISHED, schoolId: v.schoolId, actorUserId: actor?.userId, targetType: "HelpVideo", targetId: id, metadata: { updated: Object.keys(data) } });
}

/** Videos visible to a viewer: this school's own videos + platform-wide ones.
 *  When forAdmin is false, only published videos are returned. */
export async function listVideos(opts: { schoolId?: string | null; category?: string; audience?: string; forAdmin?: boolean } = {}) {
  const schoolFilter = opts.schoolId
    ? { OR: [{ schoolId: opts.schoolId }, { schoolId: null }] }
    : {}; // platform admin sees everything
  return prisma.helpVideo.findMany({
    where: {
      ...schoolFilter,
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.audience && opts.audience !== "all" ? { audience: { in: [opts.audience, "all"] } } : {}),
      ...(opts.forAdmin ? {} : { published: true }),
    },
    orderBy: [{ category: "asc" }, { sequence: "asc" }, { createdAt: "asc" }],
  });
}

/** Record a view (best-effort; used for the "most watched" stat). */
export async function recordVideoView(id: string): Promise<void> {
  try { await prisma.helpVideo.update({ where: { id }, data: { views: { increment: 1 } } }); } catch { /* ignore */ }
}
