import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";
import { deliver, getPrefs } from "./notify";
import { unreadCount, inboxList, summarizeByKind, type NotificationLike } from "./inbox-logic";

// The notification inbox data layer + a reusable notifier that surfaces a "new
// update / information" BOTH in-app (the red-badge feed) AND outside the app
// (push / email / SMS / WhatsApp) via the real provider adapters, honouring each
// user's channel preferences and consent. Pure rules live in inbox-logic.ts.

/** The current user's inbox: in-app feed + unread badge count + per-kind summary. */
export async function getInbox(userId: string, take = 60) {
  const notifications = await prisma.notification.findMany({
    where: { userId, channel: "inapp" },
    orderBy: { createdAt: "desc" },
    take,
  });
  const list = inboxList(notifications as unknown as NotificationLike[]);
  return {
    unread: unreadCount(notifications as unknown as NotificationLike[]),
    byKind: summarizeByKind(notifications as unknown as NotificationLike[]),
    notifications: list,
  };
}

/** Just the badge number (cheap — for polling / app badge). */
export async function badgeCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, channel: "inapp", read: false } });
}

export async function markRead(userId: string, ids?: string[]): Promise<{ updated: number }> {
  const where: any = { userId, channel: "inapp", read: false, ...(ids && ids.length ? { id: { in: ids } } : {}) };
  const r = await prisma.notification.updateMany({ where, data: { read: true, status: "read" } });
  return { updated: r.count };
}

export async function markAllRead(userId: string): Promise<{ updated: number }> {
  return markRead(userId);
}

/**
 * Notify a set of users about a new update/information. Writes the in-app feed
 * row (which drives the red badge) for each user, then fans out to their other
 * preferred channels through the real adapters (push/email/SMS/WhatsApp),
 * honouring prefs + consent. Returns per-channel delivery counts.
 */
export async function notifyInformation(input: {
  userIds: string[];
  kind?: string;                 // announcement | info | report | policy | ...
  title: string;
  body?: string;
  schoolId?: string | null;
  studentId?: string | null;
  channels?: string[];           // extra channels to attempt beyond in-app
  emergency?: boolean;
  actorUserId?: string | null;
}): Promise<{ recipients: number; perChannel: Record<string, number> }> {
  const kind = input.kind ?? "info";
  const extraChannels = (input.channels ?? ["push", "email"]).filter((c) => c !== "inapp");
  const perChannel: Record<string, number> = { inapp: 0 };
  const rows: any[] = [];

  for (const userId of input.userIds) {
    // 1) In-app feed row — always created (this is what the badge counts).
    rows.push({ userId, schoolId: input.schoolId ?? null, studentId: input.studentId ?? null, kind, title: input.title, body: input.body ?? null, channel: "inapp", status: "delivered", read: false });
    perChannel.inapp++;

    // 2) Outside-the-app channels, gated by the user's prefs + consent.
    const prefs = input.emergency ? null : await getPrefs(userId);
    for (const ch of extraChannels) {
      const allowed = input.emergency || (prefs ? (prefs.channels[ch] ?? false) : true);
      if (!allowed) continue;
      const res = await deliver(ch, userId, input.title, input.body, input.emergency);
      rows.push({ userId, schoolId: input.schoolId ?? null, kind, title: input.title, body: input.body ?? null, channel: ch, status: res.status === "sent" ? "sent" : "failed", providerId: res.providerId ?? null, read: true });
      if (res.status === "sent") perChannel[ch] = (perChannel[ch] ?? 0) + 1;
    }
  }
  if (rows.length) await prisma.notification.createMany({ data: rows });
  await recordAudit({ action: AUDIT.NOTIFICATION_SENT, schoolId: input.schoolId ?? null, actorUserId: input.actorUserId, targetType: "Notification", metadata: { kind, recipients: input.userIds.length, ...perChannel } });
  return { recipients: input.userIds.length, perChannel };
}

/** Notify all guardians (parents) and/or teachers in a school of new info. */
export async function notifySchoolAudience(schoolId: string, audience: "parents" | "teachers" | "both", info: { kind?: string; title: string; body?: string; channels?: string[]; actorUserId?: string | null }) {
  const userIds = new Set<string>();
  if (audience === "parents" || audience === "both") {
    const links = await prisma.guardianLink.findMany({ where: { schoolId }, select: { parentUserId: true } });
    links.forEach((l) => userIds.add(l.parentUserId));
  }
  if (audience === "teachers" || audience === "both") {
    const ms = await prisma.membership.findMany({ where: { schoolId, role: "Teacher" }, select: { userId: true } });
    ms.forEach((m) => userIds.add(m.userId));
  }
  return notifyInformation({ userIds: Array.from(userIds), schoolId, ...info });
}
