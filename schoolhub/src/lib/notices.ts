import { prisma } from "./db";
import { ROLES } from "./constants";

// Announcement Centre. A Notice is either global (platform-wide, authored by a
// Super Administrator) or school-scoped (authored by a School Administrator).
// Per-user state lives in NoticeReceipt: readAt (explicitly marked read) and
// dismissedAt (banner hidden). Dismiss is NOT read — a dismissed notice stays
// unread in the centre until the user marks it read.

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };
const ADMIN_ROLES: string[] = [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER];

export type NoticeView = {
  id: string; scope: string; schoolId: string | null;
  title: string; body: string; priority: string;
  authorName: string | null; publishedAt: Date; updatedAt: Date; expiresAt: Date | null;
  read: boolean; dismissed: boolean;
};

function sortNotices<T extends { priority: string; publishedAt: Date }>(a: T, b: T) {
  const pr = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
  return pr !== 0 ? pr : new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
}

/** Active (published, unexpired) notices visible to a user, with read/dismiss state. */
export async function listForUser(userId: string, schoolIds: string[]) {
  const now = new Date();
  const notices = await prisma.notice.findMany({
    where: {
      status: "published",
      AND: [
        { OR: [{ scope: "global" }, { schoolId: { in: schoolIds.length ? schoolIds : ["__none__"] } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
    },
  });
  const ids = notices.map((n) => n.id);
  const receipts = ids.length ? await prisma.noticeReceipt.findMany({ where: { userId, noticeId: { in: ids } } }) : [];
  const rmap = new Map(receipts.map((r) => [r.noticeId, r]));

  const items: NoticeView[] = notices.map((n) => {
    const r = rmap.get(n.id);
    return {
      id: n.id, scope: n.scope, schoolId: n.schoolId, title: n.title, body: n.body, priority: n.priority,
      authorName: n.authorName, publishedAt: n.publishedAt, updatedAt: n.updatedAt, expiresAt: n.expiresAt,
      read: !!r?.readAt, dismissed: !!r?.dismissedAt,
    };
  }).sort(sortNotices);

  const unread = items.filter((i) => !i.read).length;
  const banner = items.find((i) => !i.dismissed) || null; // top-priority, undismissed
  return { items, unread, banner };
}

export async function markRead(userId: string, noticeId: string) {
  await prisma.noticeReceipt.upsert({
    where: { noticeId_userId: { noticeId, userId } },
    create: { noticeId, userId, readAt: new Date() },
    update: { readAt: new Date() },
  });
  return { ok: true };
}

export async function markAllRead(userId: string, schoolIds: string[]) {
  const { items } = await listForUser(userId, schoolIds);
  const now = new Date();
  for (const it of items.filter((i) => !i.read)) {
    await prisma.noticeReceipt.upsert({
      where: { noticeId_userId: { noticeId: it.id, userId } },
      create: { noticeId: it.id, userId, readAt: now },
      update: { readAt: now },
    });
  }
  return { ok: true };
}

export async function dismiss(userId: string, noticeId: string) {
  await prisma.noticeReceipt.upsert({
    where: { noticeId_userId: { noticeId, userId } },
    create: { noticeId, userId, dismissedAt: new Date() }, // dismiss ≠ read
    update: { dismissedAt: new Date() },
  });
  return { ok: true };
}

// ---- authoring ----

export function canAuthor(ctx: { isPlatformAdmin: boolean; memberships: { schoolId: string; role: string }[] }) {
  return ctx.isPlatformAdmin || ctx.memberships.some((m) => ADMIN_ROLES.includes(m.role));
}

export function canManage(ctx: { isPlatformAdmin: boolean; memberships: { schoolId: string; role: string }[] }, scope: string, schoolId?: string | null) {
  if (ctx.isPlatformAdmin) return true;
  if (scope === "global") return false; // only the Super Admin publishes globally
  return !!schoolId && ctx.memberships.some((m) => m.schoolId === schoolId && ADMIN_ROLES.includes(m.role));
}

/** Notices the caller may manage (for the authoring/history list). */
export async function listManageable(ctx: { isPlatformAdmin: boolean; memberships: { schoolId: string; role: string }[] }) {
  if (ctx.isPlatformAdmin) return prisma.notice.findMany({ orderBy: { publishedAt: "desc" }, take: 100 });
  const schoolIds = ctx.memberships.filter((m) => ADMIN_ROLES.includes(m.role)).map((m) => m.schoolId);
  if (!schoolIds.length) return [];
  return prisma.notice.findMany({ where: { schoolId: { in: schoolIds } }, orderBy: { publishedAt: "desc" }, take: 100 });
}

export async function createNotice(authorId: string, authorName: string, input: { scope?: string; schoolId?: string | null; title: string; body: string; priority?: string; status?: string; expiresAt?: string | null }) {
  const scope = input.scope === "global" ? "global" : "school";
  return prisma.notice.create({
    data: {
      scope, schoolId: scope === "global" ? null : input.schoolId || null,
      title: input.title.trim(), body: input.body.trim(),
      priority: ["low", "normal", "high", "critical"].includes(input.priority || "") ? input.priority! : "normal",
      status: input.status === "draft" ? "draft" : "published",
      authorId, authorName, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });
}

export async function updateNotice(id: string, input: any) {
  const data: any = {};
  for (const k of ["title", "body", "priority", "status"] as const) if (input[k] != null) data[k] = input[k];
  if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  return prisma.notice.update({ where: { id }, data });
}

export async function archiveNotice(id: string) {
  return prisma.notice.update({ where: { id }, data: { status: "archived" } });
}
