import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";
import { renderTemplate, firstName } from "./crm-logic";

// Reusable template library: email campaigns, message-board posts and email
// notification templates. Platform-scoped templates flagged sharedWithTenants
// are visible to tenant admins so schools start from a house style. Rendering
// reuses the CRM merge-tag engine (crm-logic).

export const TEMPLATE_STATUSES = ["draft", "approved", "published"] as const;
function normTemplateStatus(s?: string | null): string {
  return s && (TEMPLATE_STATUSES as readonly string[]).includes(s) ? s : "draft";
}

async function snapshotTemplate(templateId: string, note: string, actorUserId?: string | null): Promise<void> {
  const t = await prisma.messageTemplate.findUnique({ where: { id: templateId } });
  if (!t) return;
  await prisma.messageTemplateVersion.create({
    data: {
      templateId: t.id, kind: t.kind, name: t.name, category: t.category, subject: t.subject,
      body: t.body, status: (t as any).status ?? "draft", note, changedById: actorUserId ?? null,
    },
  });
}

export async function createTemplate(input: {
  scope?: string; schoolId?: string | null; kind?: string; name: string; category?: string;
  audience?: string; subject?: string; body?: string; channels?: string[];
  sharedWithTenants?: boolean; status?: string; actorUserId?: string | null;
}): Promise<{ id: string }> {
  const status = normTemplateStatus(input.status);
  const t = await prisma.messageTemplate.create({
    data: {
      scope: input.scope ?? (input.schoolId ? "tenant" : "platform"),
      schoolId: input.schoolId ?? null,
      kind: input.kind ?? "email_campaign",
      name: input.name,
      category: input.category ?? "general",
      audience: input.audience ?? null,
      subject: input.subject ?? null,
      body: input.body ?? "",
      channelsJson: JSON.stringify(input.channels ?? []),
      sharedWithTenants: input.sharedWithTenants ?? false,
      status,
      ...(status !== "draft" ? { approvedById: input.actorUserId ?? null, approvedAt: new Date() } : {}),
      createdById: input.actorUserId ?? null,
    },
  });
  await snapshotTemplate(t.id, "Created", input.actorUserId);
  await recordAudit({ action: AUDIT.TEMPLATE_CREATED, schoolId: input.schoolId ?? null, actorUserId: input.actorUserId, targetType: "MessageTemplate", targetId: t.id, metadata: { kind: t.kind, shared: t.sharedWithTenants, status } });
  return { id: t.id };
}

export async function updateTemplate(id: string, patch: {
  name?: string; category?: string; audience?: string; subject?: string; body?: string;
  channels?: string[]; sharedWithTenants?: boolean; status?: string; note?: string; actorUserId?: string | null;
}): Promise<void> {
  const data: Record<string, unknown> = {};
  for (const k of ["name", "category", "audience", "subject", "body", "sharedWithTenants"] as const) {
    if (patch[k] !== undefined) data[k] = patch[k];
  }
  if (patch.channels !== undefined) data.channelsJson = JSON.stringify(patch.channels);
  if (patch.status !== undefined) {
    const s = normTemplateStatus(patch.status);
    data.status = s;
    if (s !== "draft") { data.approvedById = patch.actorUserId ?? null; data.approvedAt = new Date(); }
  }
  const t = await prisma.messageTemplate.update({ where: { id }, data });
  await snapshotTemplate(id, patch.note?.trim() || "Edited", patch.actorUserId);
  await recordAudit({ action: patch.sharedWithTenants !== undefined ? AUDIT.TEMPLATE_SHARED : AUDIT.TEMPLATE_UPDATED, schoolId: t.schoolId, actorUserId: patch.actorUserId, targetType: "MessageTemplate", targetId: id });
}

export async function setTemplateStatus(id: string, status: string, actor?: { userId?: string | null }): Promise<void> {
  const s = normTemplateStatus(status);
  const data: any = { status: s };
  if (s !== "draft") { data.approvedById = actor?.userId ?? null; data.approvedAt = new Date(); }
  await prisma.messageTemplate.update({ where: { id }, data });
  await snapshotTemplate(id, `Status → ${s}`, actor?.userId);
  await recordAudit({ action: AUDIT.TEMPLATE_UPDATED, actorUserId: actor?.userId, targetType: "MessageTemplate", targetId: id, metadata: { status: s } });
}

export async function listTemplateVersions(templateId: string) {
  return prisma.messageTemplateVersion.findMany({ where: { templateId }, orderBy: { changedAt: "desc" }, take: 100 });
}

export async function restoreTemplateVersion(templateId: string, versionId: string, actor?: { userId?: string | null }): Promise<void> {
  const v = await prisma.messageTemplateVersion.findUnique({ where: { id: versionId } });
  if (!v || v.templateId !== templateId) throw new Error("Version not found for this template");
  await updateTemplate(templateId, {
    name: v.name, category: v.category, subject: v.subject ?? undefined, body: v.body,
    note: `Restored from version saved ${new Date(v.changedAt).toISOString()}`, actorUserId: actor?.userId,
  });
}

export async function deleteTemplate(id: string, actor?: { userId?: string | null }): Promise<void> {
  const t = await prisma.messageTemplate.delete({ where: { id } });
  await recordAudit({ action: AUDIT.TEMPLATE_DELETED, schoolId: t.schoolId, actorUserId: actor?.userId, targetType: "MessageTemplate", targetId: id });
}

/** Platform view: all platform-scoped templates (optionally filtered by kind). */
export async function listPlatformTemplates(kind?: string) {
  return prisma.messageTemplate.findMany({
    where: { scope: "platform", ...(kind ? { kind } : {}) },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
}

/** Tenant view: this school's own templates + platform templates shared with
 *  tenants. */
export async function listTenantTemplates(schoolId: string, kind?: string) {
  return prisma.messageTemplate.findMany({
    where: {
      OR: [
        { schoolId, scope: "tenant" },
        { scope: "platform", sharedWithTenants: true },
      ],
      ...(kind ? { kind } : {}),
    },
    orderBy: [{ scope: "desc" }, { kind: "asc" }, { name: "asc" }],
  });
}

/** Render a template with sample or supplied merge vars — powers the preview panel. */
export function renderPreview(tpl: { subject?: string | null; body: string }, vars?: Record<string, string>) {
  const v = {
    name: vars?.name ?? firstName(vars?.fullName ?? null),
    email: vars?.email ?? "parent@example.com",
    school: vars?.school ?? "Northwind Academy",
    unsubscribe: vars?.unsubscribe ?? "https://app.siplat.co/unsubscribe",
    ...(vars ?? {}),
  };
  return { subject: renderTemplate(tpl.subject ?? "", v), body: renderTemplate(tpl.body ?? "", v) };
}
