// Pure CRM logic — no DB. Handles email normalisation/validation, unsubscribe
// token hashing (HMAC — raw tokens never stored plaintext elsewhere), audience
// resolution filters, campaign state-machine transitions, merge-tag rendering,
// recipient de-duplication, and campaign stat rollups. DB flows live in
// src/lib/crm.ts. Unit-tested in tests/crm.test.ts.

import { createHmac, timingSafeEqual, randomBytes } from "crypto";

const SECRET = () => process.env.CRM_SECRET || process.env.JWT_SECRET || "dev-only-change-me";

// ---------------------------------------------------------------------------
// Audiences — the built-in buckets the CRM can target.
// ---------------------------------------------------------------------------
export const AUDIENCES = [
  "subscriber",
  "parent",
  "driver",
  "tenant_admin",
  "teacher",
  "transport_manager",
  "lead",
] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<string, string> = {
  subscriber: "Website subscribers",
  parent: "Parents / guardians",
  driver: "Drivers",
  tenant_admin: "Tenant admins",
  teacher: "Teachers",
  transport_manager: "Transport managers",
  lead: "Leads",
};

// Map an audience bucket to the platform role it corresponds to (null for
// contact-only buckets like subscribers/leads that are not platform users).
export function audienceToRole(a: string): string | null {
  switch (a) {
    case "parent": return "Parent";
    case "driver": return "Driver";
    case "tenant_admin": return "SchoolAdministrator";
    case "teacher": return "Teacher";
    case "transport_manager": return "TransportManager";
    default: return null; // subscriber | lead => CRM contacts only
  }
}

export function isValidAudience(a: string): a is Audience {
  return (AUDIENCES as readonly string[]).includes(a);
}

// ---------------------------------------------------------------------------
// Email handling
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  return String(raw || "").trim().toLowerCase();
}
export function isValidEmail(raw: string): boolean {
  const e = normalizeEmail(raw);
  return e.length <= 254 && EMAIL_RE.test(e);
}

// ---------------------------------------------------------------------------
// Unsubscribe tokens (HMAC — deterministic per email, safe to embed in links)
// ---------------------------------------------------------------------------
export function unsubToken(email: string, salt?: string): string {
  const s = salt || randomBytes(8).toString("hex");
  const mac = createHmac("sha256", SECRET()).update("u:" + normalizeEmail(email) + ":" + s).digest("hex").slice(0, 32);
  return `${s}.${mac}`;
}
export function verifyUnsubToken(email: string, token: string): boolean {
  if (!token || !token.includes(".")) return false;
  const [salt] = token.split(".");
  const expected = unsubToken(email, salt);
  if (expected.length !== token.length) return false;
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(token)); } catch { return false; }
}

// ---------------------------------------------------------------------------
// Audience resolution — turn a filter descriptor into predicates the DB layer
// can apply. Pure so it is unit-testable without a database.
// ---------------------------------------------------------------------------
export type AudienceFilter = {
  audiences?: string[];      // which buckets
  schoolIds?: string[];      // restrict to these schools (empty/undefined = all)
  status?: string;           // contact status filter (default "subscribed")
  tags?: string[];           // must contain ALL of these tags
  consentRequired?: boolean; // only contacts with marketing consent
};

export function normalizeFilter(f: AudienceFilter | null | undefined): Required<AudienceFilter> {
  const audiences = (f?.audiences ?? []).filter(isValidAudience);
  return {
    audiences: audiences.length ? audiences : ["subscriber"],
    schoolIds: f?.schoolIds ?? [],
    status: f?.status ?? "subscribed",
    tags: f?.tags ?? [],
    consentRequired: f?.consentRequired ?? false,
  };
}

export type ContactLike = {
  email: string; audience: string; schoolId?: string | null;
  status: string; tagsJson?: string; consent?: boolean;
};

/** Does a contact match a (normalised) filter? */
export function contactMatches(c: ContactLike, f: Required<AudienceFilter>): boolean {
  if (!f.audiences.includes(c.audience)) return false;
  if (f.status && c.status !== f.status) return false;
  if (f.schoolIds.length && !(c.schoolId && f.schoolIds.includes(c.schoolId))) return false;
  if (f.consentRequired && !c.consent) return false;
  if (f.tags.length) {
    let tags: string[] = [];
    try { tags = JSON.parse(c.tagsJson || "[]"); } catch { tags = []; }
    if (!f.tags.every((t) => tags.includes(t))) return false;
  }
  return true;
}

/** Which platform roles must be queried to satisfy this filter (parents, etc.). */
export function rolesForFilter(f: Required<AudienceFilter>): string[] {
  return Array.from(new Set(f.audiences.map(audienceToRole).filter((r): r is string => !!r)));
}

// ---------------------------------------------------------------------------
// Recipient de-duplication — one email wins even if present as both a contact
// and a platform user, or in two targeted schools.
// ---------------------------------------------------------------------------
export type Recipient = { email: string; name?: string | null; contactId?: string | null; userId?: string | null };

export function dedupeRecipients(list: Recipient[]): Recipient[] {
  const seen = new Map<string, Recipient>();
  for (const r of list) {
    const key = normalizeEmail(r.email);
    if (!isValidEmail(key)) continue;
    const existing = seen.get(key);
    if (!existing) { seen.set(key, { ...r, email: key }); continue; }
    // Merge: prefer a userId link and a non-empty name.
    seen.set(key, {
      email: key,
      name: existing.name || r.name || null,
      contactId: existing.contactId ?? r.contactId ?? null,
      userId: existing.userId ?? r.userId ?? null,
    });
  }
  return Array.from(seen.values());
}

// ---------------------------------------------------------------------------
// Campaign state machine
// ---------------------------------------------------------------------------
export const CAMPAIGN_STATES = ["draft", "scheduled", "sending", "sent", "cancelled", "failed"] as const;
export type CampaignState = (typeof CAMPAIGN_STATES)[number];

const TRANSITIONS: Record<CampaignState, CampaignState[]> = {
  draft: ["scheduled", "sending", "cancelled"],
  scheduled: ["sending", "cancelled", "draft"],
  sending: ["sent", "failed"],
  sent: [],
  cancelled: [],
  failed: ["draft"],
};

export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS as Record<string, string[]>)[from]?.includes(to) ?? false;
}

/** Is the campaign ready to send right now? */
export function canSendNow(c: { status: string; subject?: string; scheduledFor?: Date | string | null }, now: Date): { ok: boolean; reason: string } {
  if (c.status !== "draft" && c.status !== "scheduled") return { ok: false, reason: `cannot send from '${c.status}'` };
  if (!c.subject || !c.subject.trim()) return { ok: false, reason: "subject required" };
  if (c.status === "scheduled" && c.scheduledFor && new Date(c.scheduledFor).getTime() > now.getTime()) {
    return { ok: false, reason: "scheduled for the future" };
  }
  return { ok: true, reason: "ok" };
}

// ---------------------------------------------------------------------------
// Merge tags — {{name}}, {{email}}, {{school}}, {{unsubscribe}}
// ---------------------------------------------------------------------------
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return String(tpl || "").replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_m, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key] ?? "") : "";
  });
}
export function firstName(name?: string | null): string {
  const n = String(name || "").trim();
  if (!n) return "there";
  return n.split(/\s+/)[0];
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
export type RecipientStat = { status: string };
export function rollup(recipients: RecipientStat[]) {
  const total = recipients.length;
  const by = (s: string) => recipients.filter((r) => r.status === s).length;
  const sent = by("sent") + by("opened") + by("clicked");
  const opened = by("opened") + by("clicked");
  const clicked = by("clicked");
  const failed = by("failed") + by("bounced");
  const unsub = by("unsubscribed");
  const pct = (n: number) => (sent > 0 ? Math.round((n / sent) * 1000) / 10 : 0);
  return { total, sent, failed, unsub, opened, clicked, openRate: pct(opened), clickRate: pct(clicked) };
}
