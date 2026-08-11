import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";
import { renderTemplate, firstName } from "./crm-logic";

// Reusable template library: email campaigns, message-board posts and email
// notification templates. Platform-scoped templates flagged sharedWithTenants
// are visible to tenant admins so schools start from a house style. Rendering
// reuses the CRM merge-tag engine (crm-logic).

export async function createTemplate(input: {
  scope?: string; schoolId?: string | null; kind?: string; name: string; category?: string;
  audience?: string; subject?: string; body?: string; channels?: string[];
  sharedWithTenants?: boolean; actorUserId?: string | null;
}): Promise<{ id: string }> {
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
      createdById: input.actorUserId ?? null,
    },
  });
  await recordAudit({ action: AUDIT.TEMPLATE_CREATED, schoolId: input.schoolId ?? null, actorUserId: input.actorUserId, targetType: "MessageTemplate", targetId: t.id, metadata: { kind: t.kind, shared: t.sharedWithTenants } });
  return { id: t.id };
}

export async function updateTemplate(id: string, patch: {
  name?: string; category?: string; audience?: string; subject?: string; body?: string;
  channels?: string[]; sharedWithTenants?: boolean; actorUserId?: string | null;
}): Promise<void> {
  const data: Record<string, unknown> = {};
  for (const k of ["name", "category", "audience", "subject", "body", "sharedWithTenants"] as const) {
    if (patch[k] !== undefined) data[k] = patch[k];
  }
  if (patch.channels !== undefined) data.channelsJson = JSON.stringify(patch.channels);
  const t = await prisma.messageTemplate.update({ where: { id }, data });
  await recordAudit({ action: patch.sharedWithTenants !== undefined ? AUDIT.TEMPLATE_SHARED : AUDIT.TEMPLATE_UPDATED, schoolId: t.schoolId, actorUserId: patch.actorUserId, targetType: "MessageTemplate", targetId: id });
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
