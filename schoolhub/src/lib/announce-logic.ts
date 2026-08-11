// Pure logic for school announcements. A school can announce to all parents or a
// targeted subset (year, class, or an explicit list), over one or more channels
// (in-app, email, WhatsApp, SMS). Channel gating honours consent: SMS is opt-out,
// WhatsApp is opt-in (per user), and in-app is always allowed. DB flows live in
// src/lib/announcements.ts. Unit-tested in tests/phase17c.test.ts.

export const CHANNELS = ["inapp", "email", "whatsapp", "sms"] as const;
export type Channel = (typeof CHANNELS)[number];

export const AUDIENCE_KINDS = ["all", "year", "class", "list"] as const;

export type AnnounceAudience = {
  kind: string;      // all | year | class | list
  years?: string[];  // for kind=year
  classes?: string[]; // for kind=class
  userIds?: string[]; // for kind=list
};

export function isValidChannel(c: string): c is Channel {
  return (CHANNELS as readonly string[]).includes(c);
}

export function normalizeChannels(chs: string[] | undefined): Channel[] {
  const set = new Set((chs ?? []).filter(isValidChannel));
  set.add("inapp"); // in-app is always delivered
  return CHANNELS.filter((c) => set.has(c));
}

export type RecipientLike = {
  userId: string;
  year?: string | null;
  className?: string | null;
  email?: string | null;
  phone?: string | null;
  smsOptOut?: boolean;
  whatsappOptIn?: boolean;
};

/** Resolve which recipients match the audience descriptor. */
export function resolveAudience(recipients: RecipientLike[], audience: AnnounceAudience): RecipientLike[] {
  switch (audience.kind) {
    case "all": return recipients.slice();
    case "year": return recipients.filter((r) => r.year && (audience.years ?? []).includes(r.year));
    case "class": return recipients.filter((r) => r.className && (audience.classes ?? []).includes(r.className));
    case "list": {
      const ids = new Set(audience.userIds ?? []);
      return recipients.filter((r) => ids.has(r.userId));
    }
    default: return [];
  }
}

/** For a recipient + requested channels, which channels can actually be used
 *  (consent + contactability)? In-app always; email needs an address; SMS is
 *  opt-out; WhatsApp is opt-in. */
export function deliverableChannels(r: RecipientLike, requested: Channel[]): Channel[] {
  const out: Channel[] = [];
  for (const c of requested) {
    if (c === "inapp") out.push(c);
    else if (c === "email" && r.email) out.push(c);
    else if (c === "sms" && r.phone && !r.smsOptOut) out.push(c);
    else if (c === "whatsapp" && r.phone && r.whatsappOptIn) out.push(c);
  }
  return out;
}

/** Plan an announcement: recipients + per-channel counts (what will actually send). */
export function planAnnouncement(recipients: RecipientLike[], audience: AnnounceAudience, channels: string[]) {
  const targets = resolveAudience(recipients, audience);
  const chans = normalizeChannels(channels);
  const perChannel: Record<string, number> = {};
  for (const c of chans) perChannel[c] = 0;
  let reachable = 0;
  for (const r of targets) {
    const d = deliverableChannels(r, chans);
    if (d.length) reachable++;
    for (const c of d) perChannel[c]++;
  }
  return { targeted: targets.length, reachable, channels: chans, perChannel };
}

export function validateAnnouncement(input: { title?: string; body?: string; audience?: AnnounceAudience; channels?: string[] }): { ok: boolean; reason: string } {
  if (!input.title || !input.title.trim()) return { ok: false, reason: "title required" };
  if (!input.body || !input.body.trim()) return { ok: false, reason: "message required" };
  if (!input.audience || !(AUDIENCE_KINDS as readonly string[]).includes(input.audience.kind)) return { ok: false, reason: "valid audience required" };
  if (!normalizeChannels(input.channels).length) return { ok: false, reason: "at least one channel" };
  return { ok: true, reason: "ok" };
}
