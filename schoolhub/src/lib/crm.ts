import { prisma } from "./db";
import { sendEmail } from "./email";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";
import {
  normalizeEmail, isValidEmail, unsubToken, verifyUnsubToken,
  normalizeFilter, rolesForFilter, dedupeRecipients, canSendNow,
  renderTemplate, firstName, type AudienceFilter, type Recipient,
} from "./crm-logic";

// CRM data layer: website subscriber capture, contact upserts, audience
// resolution across CRM contacts AND platform users (parents/drivers/tenant
// admins…), campaign creation + fan-out (via the email stub), unsubscribe, and
// stat rollups. Platform-level when schoolId is null; tenant-scoped otherwise.
// Pure rules live in crm-logic.ts (unit-tested). Email "sending" is the console
// stub until a real provider is wired.

const APP_URL = () => process.env.APP_URL || "https://app.siplat.co";

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

/** Capture (or refresh) a website subscriber / lead into the CRM. Idempotent on
 *  (email, schoolId). Returns { created }. */
export async function captureContact(input: {
  email: string; name?: string; phone?: string; audience?: string;
  interest?: string; source?: string; schoolId?: string | null; consent?: boolean;
  tags?: string[]; userId?: string | null;
}): Promise<{ id: string; created: boolean }> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw new Error("invalid email");
  const schoolId = input.schoolId ?? null;

  const existing = await prisma.crmContact.findUnique({ where: { email_schoolId: { email, schoolId } } });
  const tagsJson = JSON.stringify(Array.from(new Set(input.tags ?? [])));

  if (existing) {
    const updated = await prisma.crmContact.update({
      where: { id: existing.id },
      data: {
        name: input.name ?? existing.name,
        phone: input.phone ?? existing.phone,
        interest: input.interest ?? existing.interest,
        userId: input.userId ?? existing.userId,
        // Re-subscribing an unsubscribed contact only on explicit consent.
        status: existing.status === "unsubscribed" && input.consent ? "subscribed" : existing.status,
        consent: input.consent ?? existing.consent,
        optInAt: input.consent && !existing.optInAt ? new Date() : existing.optInAt,
      },
    });
    return { id: updated.id, created: false };
  }

  const created = await prisma.crmContact.create({
    data: {
      email, schoolId,
      name: input.name ?? null,
      phone: input.phone ?? null,
      audience: input.audience ?? "subscriber",
      source: input.source ?? "website",
      interest: input.interest ?? null,
      tagsJson,
      userId: input.userId ?? null,
      status: "subscribed",
      consent: input.consent ?? true,
      optInAt: new Date(),
      unsubToken: unsubToken(email),
    },
  });
  await recordAudit({ action: AUDIT.CONTACT_CAPTURED, schoolId, targetType: "CrmContact", targetId: created.id, metadata: { source: created.source, audience: created.audience } });
  return { id: created.id, created: true };
}

/** Unsubscribe a contact via a signed link token (public, no auth). */
export async function unsubscribeByToken(email: string, token: string): Promise<boolean> {
  const e = normalizeEmail(email);
  // Accept either the stored token or a valid HMAC token for the email.
  const contact = await prisma.crmContact.findFirst({ where: { email: e } });
  if (!contact) return false;
  const okStored = contact.unsubToken && contact.unsubToken === token;
  if (!okStored && !verifyUnsubToken(e, token)) return false;
  await prisma.crmContact.updateMany({ where: { email: e }, data: { status: "unsubscribed", consent: false } });
  await recordAudit({ action: AUDIT.CONTACT_UNSUBSCRIBED, schoolId: contact.schoolId, targetType: "CrmContact", targetId: contact.id });
  return true;
}

/** Mirror platform users of the given roles into CRM contacts so campaigns can
 *  reach them. Idempotent; keeps the contact's audience in step with the role. */
export async function syncUsersToContacts(roles: string[], schoolId?: string | null): Promise<number> {
  if (!roles.length) return 0;
  const audienceForRole: Record<string, string> = {
    Parent: "parent", Driver: "driver", SchoolAdministrator: "tenant_admin",
    Teacher: "teacher", TransportManager: "transport_manager",
  };
  const memberships = await prisma.membership.findMany({
    where: { role: { in: roles }, ...(schoolId ? { schoolId } : {}) },
    include: { user: true },
  });
  let n = 0;
  for (const m of memberships) {
    if (!m.user?.email) continue;
    await captureContact({
      email: m.user.email,
      name: m.user.fullName ?? undefined,
      audience: audienceForRole[m.role] ?? "lead",
      source: "user_sync",
      schoolId: m.schoolId,
      userId: m.userId,
      consent: true,
    });
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Audience resolution — contacts + live platform users, de-duplicated by email.
// ---------------------------------------------------------------------------

export async function resolveRecipients(filter: AudienceFilter, scopeSchoolId?: string | null): Promise<Recipient[]> {
  const f = normalizeFilter(filter);
  const schoolIds = scopeSchoolId ? [scopeSchoolId] : f.schoolIds;

  // 1) CRM contacts (subscribers, leads, previously-synced users).
  const contacts = await prisma.crmContact.findMany({
    where: {
      audience: { in: f.audiences },
      status: f.status,
      ...(schoolIds.length ? { schoolId: { in: schoolIds } } : {}),
      ...(f.consentRequired ? { consent: true } : {}),
    },
    select: { id: true, email: true, name: true, userId: true, tagsJson: true },
  });
  const tagFiltered = contacts.filter((c) => {
    if (!f.tags.length) return true;
    let tags: string[] = [];
    try { tags = JSON.parse(c.tagsJson || "[]"); } catch { /* ignore */ }
    return f.tags.every((t) => tags.includes(t));
  });

  // 2) Live platform users for role-backed audiences (so a brand-new parent is
  //    reachable even before a contact row exists).
  const roles = rolesForFilter(f);
  let userRecipients: Recipient[] = [];
  if (roles.length) {
    const memberships = await prisma.membership.findMany({
      where: { role: { in: roles }, ...(schoolIds.length ? { schoolId: { in: schoolIds } } : {}) },
      include: { user: { select: { id: true, email: true, fullName: true, status: true } } },
    });
    userRecipients = memberships
      .filter((m) => m.user && m.user.status !== "disabled" && m.user.email)
      .map((m) => ({ email: m.user!.email, name: m.user!.fullName, userId: m.user!.id, contactId: null }));
  }

  const all: Recipient[] = [
    ...tagFiltered.map((c) => ({ email: c.email, name: c.name, contactId: c.id, userId: c.userId })),
    ...userRecipients,
  ];
  // Exclude anyone who has unsubscribed at contact level.
  const unsub = await prisma.crmContact.findMany({ where: { status: "unsubscribed" }, select: { email: true } });
  const blocked = new Set(unsub.map((u) => normalizeEmail(u.email)));
  return dedupeRecipients(all).filter((r) => !blocked.has(r.email));
}

/** Live audience counts for the CRM dashboard. */
export async function audienceCounts(scopeSchoolId?: string | null): Promise<Record<string, number>> {
  const where = scopeSchoolId ? { schoolId: scopeSchoolId } : {};
  const grouped = await prisma.crmContact.groupBy({
    by: ["audience"],
    where: { ...where, status: "subscribed" },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const g of grouped) out[g.audience] = g._count._all;
  return out;
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export async function createCampaign(input: {
  name: string; subject: string; body?: string; fromName?: string; fromEmail?: string;
  segmentId?: string; audience?: AudienceFilter; scheduledFor?: string;
  schoolId?: string | null; actorUserId?: string | null; actorEmail?: string | null;
}): Promise<{ id: string }> {
  const campaign = await prisma.campaign.create({
    data: {
      schoolId: input.schoolId ?? null,
      name: input.name,
      subject: input.subject,
      body: input.body ?? "",
      fromName: input.fromName ?? "SIPlat",
      fromEmail: input.fromEmail ?? "hello@siplat.co",
      segmentId: input.segmentId ?? null,
      audienceJson: JSON.stringify(input.audience ?? {}),
      status: input.scheduledFor ? "scheduled" : "draft",
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
      createdById: input.actorUserId ?? null,
    },
  });
  await recordAudit({ action: AUDIT.CAMPAIGN_CREATED, schoolId: input.schoolId ?? null, actorUserId: input.actorUserId, actorEmail: input.actorEmail, targetType: "Campaign", targetId: campaign.id, metadata: { name: input.name } });
  return { id: campaign.id };
}

async function campaignAudience(campaign: { segmentId: string | null; audienceJson: string; schoolId: string | null }): Promise<AudienceFilter> {
  if (campaign.segmentId) {
    const seg = await prisma.crmSegment.findUnique({ where: { id: campaign.segmentId } });
    if (seg) { try { return JSON.parse(seg.filterJson); } catch { /* fall through */ } }
  }
  try { return JSON.parse(campaign.audienceJson || "{}"); } catch { return {}; }
}

/** Send a test copy to a single address without touching campaign state. */
export async function sendTest(campaignId: string, testEmail: string): Promise<void> {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new Error("campaign not found");
  const email = normalizeEmail(testEmail);
  const vars = { name: firstName(null), email, school: "", unsubscribe: `${APP_URL()}/unsubscribe` };
  await sendEmail({ to: email, subject: "[TEST] " + renderTemplate(c.subject, vars), body: renderTemplate(c.body, vars) });
}

/** Resolve the audience, create idempotent recipient rows, and fan out via the
 *  email transport. Moves the campaign draft/scheduled → sending → sent. */
export async function sendCampaign(campaignId: string, actor?: { userId?: string | null; email?: string | null }): Promise<{ sent: number; failed: number; total: number }> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("campaign not found");
  const gate = canSendNow(campaign, new Date());
  if (!gate.ok) throw new Error(gate.reason);

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "sending" } });

  const filter = await campaignAudience(campaign);
  const recipients = await resolveRecipients(filter, campaign.schoolId);

  let sent = 0, failed = 0;
  for (const r of recipients) {
    // Idempotent per (campaign, email): skip if we already have a row.
    const existing = await prisma.campaignRecipient.findUnique({ where: { campaignId_email: { campaignId, email: r.email } } });
    if (existing && existing.status === "sent") { sent++; continue; }

    const token = r.email; // unsubscribe link carries a signed token in real transport
    const vars = {
      name: firstName(r.name), email: r.email, school: "",
      unsubscribe: `${APP_URL()}/unsubscribe?e=${encodeURIComponent(r.email)}&t=${encodeURIComponent(unsubToken(token))}`,
    };
    try {
      await sendEmail({ to: r.email, subject: renderTemplate(campaign.subject, vars), body: renderTemplate(campaign.body, vars) });
      await prisma.campaignRecipient.upsert({
        where: { campaignId_email: { campaignId, email: r.email } },
        update: { status: "sent", sentAt: new Date(), error: null, name: r.name ?? null, contactId: r.contactId ?? null, userId: r.userId ?? null },
        create: { campaignId, email: r.email, name: r.name ?? null, contactId: r.contactId ?? null, userId: r.userId ?? null, status: "sent", sentAt: new Date() },
      });
      sent++;
    } catch (err: any) {
      await prisma.campaignRecipient.upsert({
        where: { campaignId_email: { campaignId, email: r.email } },
        update: { status: "failed", error: String(err?.message ?? err) },
        create: { campaignId, email: r.email, name: r.name ?? null, status: "failed", error: String(err?.message ?? err) },
      });
      failed++;
    }
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "sent", sentAt: new Date(), totalRecipients: recipients.length, sentCount: sent, failedCount: failed },
  });
  // Stamp contacts so we know when they were last emailed.
  const emails = recipients.map((r) => r.email);
  if (emails.length) await prisma.crmContact.updateMany({ where: { email: { in: emails } }, data: { lastCampaignAt: new Date() } });

  await recordAudit({ action: AUDIT.CAMPAIGN_SENT, schoolId: campaign.schoolId, actorUserId: actor?.userId, actorEmail: actor?.email, targetType: "Campaign", targetId: campaignId, metadata: { sent, failed, total: recipients.length } });
  return { sent, failed, total: recipients.length };
}

/** Duplicate a campaign as a fresh draft (recipients/stats are NOT copied). */
export async function duplicateCampaign(campaignId: string, actor?: { userId?: string | null; email?: string | null }): Promise<{ id: string }> {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new Error("campaign not found");
  const copy = await prisma.campaign.create({
    data: {
      schoolId: c.schoolId, name: `${c.name} (copy)`, subject: c.subject, body: c.body,
      fromName: c.fromName, fromEmail: c.fromEmail, segmentId: c.segmentId, audienceJson: c.audienceJson,
      status: "draft", createdById: actor?.userId ?? null,
    },
  });
  await recordAudit({ action: AUDIT.CAMPAIGN_DUPLICATED, schoolId: c.schoolId, actorUserId: actor?.userId, actorEmail: actor?.email, targetType: "Campaign", targetId: copy.id, metadata: { from: campaignId } });
  return { id: copy.id };
}

export async function cancelCampaign(campaignId: string, actor?: { userId?: string | null; email?: string | null }): Promise<void> {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new Error("campaign not found");
  if (c.status === "sent" || c.status === "sending") throw new Error(`cannot cancel a '${c.status}' campaign`);
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "cancelled" } });
  await recordAudit({ action: AUDIT.CAMPAIGN_CANCELLED, schoolId: c.schoolId, actorUserId: actor?.userId, actorEmail: actor?.email, targetType: "Campaign", targetId: campaignId });
}
