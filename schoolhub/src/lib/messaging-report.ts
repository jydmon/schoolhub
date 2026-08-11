import { prisma } from "./db";
import { ROLES } from "./constants";

// School-side per-channel delivery report. Turns the raw Notification ledger
// (written by the notification-centre engine and reconciled by the inbound
// provider webhook) into an operational view: for each channel, how many
// messages were queued / sent / delivered / read / failed, the derived
// delivered/read/failure rates, a per-message funnel for the most recent sends,
// and a consent snapshot so a school can see reach vs. addressable audience.
//
// Status funnel (a Notification carries one terminal status, advanced by the
// provider's delivery receipts):
//   queued → held during quiet hours (in-app still shows immediately)
//   sent → accepted by the provider, not yet confirmed to the handset
//   delivered → confirmed to the device (acknowledged folds in here)
//   read → read receipt received (WhatsApp; SMS never reports read)
//   failed → provider rejected, or blocked by consent (SMS opt-out / no WhatsApp opt-in)

export const REPORT_CHANNELS = ["inapp", "push", "email", "sms", "whatsapp"] as const;
const STATUS_KEYS = ["queued", "sent", "delivered", "read", "failed", "other"] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

function normalizeStatus(status: string): StatusKey {
  switch (status) {
    case "queued": return "queued";
    case "sent": return "sent";
    case "delivered":
    case "acknowledged": return "delivered"; // an ack implies receipt
    case "read": return "read";
    case "failed": return "failed";
    default: return "other";
  }
}

export type ChannelStats = {
  channel: string;
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  other: number;
  deliveredRate: number; // (delivered + read) / total, as a percentage
  readRate: number;      // read / total
  failedRate: number;    // failed / total
};

export type MessageDelivery = {
  id: string;
  title: string;
  priority: string;
  channelsRequested: string;
  recipientCount: number;
  createdAt: Date;
  perChannel: Record<string, Record<StatusKey, number>>;
};

export type DeliveryReport = {
  schoolId: string;
  window: { days: number; since: string };
  channelFilter: string | null;
  channels: ChannelStats[];
  totals: ChannelStats;
  messages: MessageDelivery[];
  consent: { parents: number; withPhone: number; whatsappOptIn: number; smsOptOut: number };
  generatedAt: string;
};

function emptyBuckets(): Record<StatusKey, number> {
  return { queued: 0, sent: 0, delivered: 0, read: 0, failed: 0, other: 0 };
}

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 1000) / 10; // one decimal place
}

function toChannelStats(channel: string, b: Record<StatusKey, number>): ChannelStats {
  const total = STATUS_KEYS.reduce((s, k) => s + b[k], 0);
  return {
    channel,
    total,
    queued: b.queued,
    sent: b.sent,
    delivered: b.delivered,
    read: b.read,
    failed: b.failed,
    other: b.other,
    deliveredRate: pct(b.delivered + b.read, total),
    readRate: pct(b.read, total),
    failedRate: pct(b.failed, total),
  };
}

export async function buildDeliveryReport(
  schoolId: string,
  opts: { days?: number; channel?: string | null } = {}
): Promise<DeliveryReport> {
  const days = Number.isFinite(opts.days) && (opts.days as number) > 0 ? Math.min(opts.days as number, 365) : 30;
  const channelFilter =
    opts.channel && (REPORT_CHANNELS as readonly string[]).includes(opts.channel) ? opts.channel : null;
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const notifWhere: any = { schoolId, kind: "message", createdAt: { gte: sinceDate } };
  if (channelFilter) notifWhere.channel = channelFilter;

  // 1) Channel × status rollup over the window.
  const grouped = await prisma.notification.groupBy({
    by: ["channel", "status"],
    where: notifWhere,
    _count: { _all: true },
  });

  const byChannel: Record<string, Record<StatusKey, number>> = {};
  const overall = emptyBuckets();
  for (const g of grouped) {
    const ch = g.channel || "inapp";
    const key = normalizeStatus(g.status);
    (byChannel[ch] ??= emptyBuckets())[key] += g._count._all;
    overall[key] += g._count._all;
  }

  // Present channels in a stable order; if filtered, only that channel. Always
  // surface sms + whatsapp rows even at zero so a school sees the channel exists.
  const channelOrder = channelFilter ? [channelFilter] : [...REPORT_CHANNELS];
  const channels = channelOrder
    .map((ch) => toChannelStats(ch, byChannel[ch] || emptyBuckets()))
    .filter((c) => c.total > 0 || c.channel === "sms" || c.channel === "whatsapp" || channelFilter);
  const totals = toChannelStats("all", overall);

  // 2) Per-message funnel for the most recent sends in the window.
  const msgs = await prisma.message.findMany({
    where: { schoolId, createdAt: { gte: sinceDate } },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  const msgIds = msgs.map((m) => m.id);
  const perMsgGrouped = msgIds.length
    ? await prisma.notification.groupBy({
        by: ["messageId", "channel", "status"],
        where: { messageId: { in: msgIds }, ...(channelFilter ? { channel: channelFilter } : {}) },
        _count: { _all: true },
      })
    : [];
  const msgMap: Record<string, Record<string, Record<StatusKey, number>>> = {};
  for (const g of perMsgGrouped) {
    if (!g.messageId) continue;
    const ch = g.channel || "inapp";
    ((msgMap[g.messageId] ??= {})[ch] ??= emptyBuckets())[normalizeStatus(g.status)] += g._count._all;
  }
  const messages: MessageDelivery[] = msgs.map((m) => ({
    id: m.id,
    title: m.title,
    priority: m.priority,
    channelsRequested: m.channels,
    recipientCount: m.recipientCount,
    createdAt: m.createdAt,
    perChannel: msgMap[m.id] || {},
  }));

  // 3) Consent snapshot for the school's guardian audience (addressable reach).
  const parentLinks = await prisma.membership.findMany({
    where: { schoolId, role: ROLES.PARENT },
    select: { userId: true },
  });
  const parentIds = Array.from(new Set(parentLinks.map((p) => p.userId)));
  const [withPhone, whatsappOptIn, smsOptOut] = parentIds.length
    ? await Promise.all([
        prisma.user.count({ where: { id: { in: parentIds }, phone: { not: null } } }),
        prisma.user.count({ where: { id: { in: parentIds }, whatsappOptIn: true } }),
        prisma.user.count({ where: { id: { in: parentIds }, smsOptOut: true } }),
      ])
    : [0, 0, 0];

  return {
    schoolId,
    window: { days, since: sinceDate.toISOString() },
    channelFilter,
    channels,
    totals,
    messages,
    consent: { parents: parentIds.length, withPhone, whatsappOptIn, smsOptOut },
    generatedAt: new Date().toISOString(),
  };
}

// ---- CSV export ------------------------------------------------------------
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

export function deliveryReportToCsv(r: DeliveryReport): string {
  const lines: string[] = [];
  lines.push(`SchoolHub messaging delivery report`);
  lines.push(`Generated,${r.generatedAt}`);
  lines.push(`Window (days),${r.window.days}`);
  lines.push(`Since,${r.window.since}`);
  if (r.channelFilter) lines.push(`Channel filter,${r.channelFilter}`);
  lines.push("");

  lines.push("Channel summary");
  lines.push(csvRow(["channel", "total", "queued", "sent", "delivered", "read", "failed", "delivered_rate_%", "read_rate_%", "failed_rate_%"]));
  for (const c of [...r.channels, r.totals]) {
    lines.push(csvRow([c.channel, c.total, c.queued, c.sent, c.delivered, c.read, c.failed, c.deliveredRate, c.readRate, c.failedRate]));
  }
  lines.push("");

  lines.push("Consent snapshot (guardians)");
  lines.push(csvRow(["parents", "with_phone", "whatsapp_opt_in", "sms_opt_out"]));
  lines.push(csvRow([r.consent.parents, r.consent.withPhone, r.consent.whatsappOptIn, r.consent.smsOptOut]));
  lines.push("");

  lines.push("Per-message delivery");
  lines.push(csvRow(["sent_at", "title", "priority", "channel", "recipients", "queued", "sent", "delivered", "read", "failed"]));
  for (const m of r.messages) {
    const chans = Object.keys(m.perChannel);
    if (chans.length === 0) {
      lines.push(csvRow([m.createdAt.toISOString(), m.title, m.priority, "—", m.recipientCount, 0, 0, 0, 0, 0]));
      continue;
    }
    for (const ch of chans) {
      const b = m.perChannel[ch];
      lines.push(csvRow([m.createdAt.toISOString(), m.title, m.priority, ch, m.recipientCount, b.queued, b.sent, b.delivered, b.read, b.failed]));
    }
  }
  return lines.join("\r\n") + "\r\n";
}
