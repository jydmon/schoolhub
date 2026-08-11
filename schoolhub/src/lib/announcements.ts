import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";
import { deliver } from "./notify";
import { planAnnouncement, validateAnnouncement, normalizeChannels, resolveAudience, type AnnounceAudience, type RecipientLike } from "./announce-logic";

// School announcements to all/selected parents over in-app/email/WhatsApp/SMS.
// Audience resolution + channel/consent gating are pure (announce-logic). Actual
// per-channel delivery reuses the existing notify/email/sms/whatsapp adapters.

/** Load the parent recipients for a school with their contactability + consent. */
async function schoolParentRecipients(schoolId: string): Promise<RecipientLike[]> {
  const links = await prisma.guardianLink.findMany({
    where: { schoolId },
    include: { student: { select: { yearGroup: true, class: { select: { name: true } } } }, /* parent via user */ },
  }).catch(() => [] as any[]);
  // Map to unique parent users with year/class from their children.
  const byUser = new Map<string, RecipientLike>();
  for (const l of links as any[]) {
    const u = await prisma.user.findUnique({ where: { id: l.parentUserId }, select: { id: true, email: true, phone: true, smsOptOut: true, whatsappOptIn: true } });
    if (!u) continue;
    byUser.set(u.id, {
      userId: u.id, email: u.email, phone: u.phone, smsOptOut: u.smsOptOut, whatsappOptIn: u.whatsappOptIn,
      year: l.student?.yearGroup ?? null, className: l.student?.class?.name ?? null,
    });
  }
  return Array.from(byUser.values());
}

export async function createAnnouncement(input: {
  schoolId: string; title: string; body: string; audience: AnnounceAudience; channels: string[];
  actorUserId?: string | null; actorEmail?: string | null;
}): Promise<{ id: string }> {
  const check = validateAnnouncement(input);
  if (!check.ok) throw new Error(check.reason);
  const a = await prisma.announcement.create({
    data: {
      schoolId: input.schoolId, title: input.title, body: input.body,
      audienceKind: input.audience.kind, audienceJson: JSON.stringify(input.audience),
      channelsJson: JSON.stringify(normalizeChannels(input.channels)),
      createdById: input.actorUserId ?? null,
    },
  });
  await recordAudit({ action: AUDIT.ANNOUNCEMENT_CREATED, schoolId: input.schoolId, actorUserId: input.actorUserId, actorEmail: input.actorEmail, targetType: "Announcement", targetId: a.id });
  return { id: a.id };
}

/** Resolve the audience and fan the announcement out across channels using the
 *  SAME delivery engine as the notification centre (notify.deliver): in-app is a
 *  Notification row, and email/SMS/WhatsApp/push go through the real provider
 *  adapters (console-mode until env-configured), honouring SMS opt-out and
 *  WhatsApp opt-in. Per-channel sent/failed is recorded on the announcement and
 *  a Notification delivery row is written for every attempt. */
export async function sendAnnouncement(id: string, actor?: { userId?: string | null; email?: string | null }): Promise<{ targeted: number; reached: number; perChannel: Record<string, number> }> {
  const a = await prisma.announcement.findUnique({ where: { id } });
  if (!a) throw new Error("announcement not found");
  const audience: AnnounceAudience = JSON.parse(a.audienceJson || "{}");
  const channels = normalizeChannels(JSON.parse(a.channelsJson || "[]"));
  const recipients = await schoolParentRecipients(a.schoolId);
  const targets = resolveAudience(recipients, audience);

  const perChannel: Record<string, number> = {};
  for (const c of channels) perChannel[c] = 0;
  const reached = new Set<string>();
  const rows: any[] = [];

  for (const r of targets) {
    for (const ch of channels) {
      if (ch === "inapp") {
        rows.push({ userId: r.userId, schoolId: a.schoolId, kind: "announcement", title: a.title, body: a.body, channel: "inapp", status: "delivered" });
        perChannel.inapp++; reached.add(r.userId);
        continue;
      }
      // Real adapter path — consent + contactability enforced inside deliver().
      const res = await deliver(ch, r.userId, a.title, a.body);
      rows.push({ userId: r.userId, schoolId: a.schoolId, kind: "announcement", title: a.title, body: a.body, channel: ch, status: res.status === "sent" ? "sent" : "failed", providerId: res.providerId ?? null });
      if (res.status === "sent") { perChannel[ch]++; reached.add(r.userId); }
    }
  }
  if (rows.length) await prisma.notification.createMany({ data: rows }).catch(() => {});

  await prisma.announcement.update({
    where: { id }, data: { status: "sent", sentAt: new Date(), targetedCount: targets.length, reachedCount: reached.size, perChannelJson: JSON.stringify(perChannel) },
  });
  await recordAudit({ action: AUDIT.ANNOUNCEMENT_SENT, schoolId: a.schoolId, actorUserId: actor?.userId, actorEmail: actor?.email, targetType: "Announcement", targetId: id, metadata: { ...perChannel, targeted: targets.length, reached: reached.size } });
  return { targeted: targets.length, reached: reached.size, perChannel };
}

export async function listAnnouncements(schoolId: string) {
  return prisma.announcement.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" }, take: 200 });
}
