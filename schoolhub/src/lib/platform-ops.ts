import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";
import { encryptSecret } from "./integration/crypto";
import { invalidateEmailCache } from "./email";
import { buildReport, isValidReportType, type ReportType } from "./report-builder-logic";

// Platform operations: email configuration, support chat with tenant admins, and
// on-demand report generation. Email secrets are encrypted (reusing the vault
// crypto) and never returned to clients.

// -------- Email configuration --------
export async function getEmailConfig() {
  const c = await prisma.emailConfig.findUnique({ where: { id: "singleton" } });
  if (!c) return { provider: "console", fromName: "SIPlat", fromEmail: "hello@siplat.co", verified: false, secretSet: false };
  const { secretEnc, ...rest } = c as any;
  return { ...rest, secretSet: !!secretEnc };
}
export async function setEmailConfig(input: { provider: string; fromName?: string; fromEmail?: string; host?: string; port?: number; username?: string; secret?: string; actorUserId?: string | null }) {
  const data: any = {
    provider: input.provider, fromName: input.fromName ?? "SIPlat", fromEmail: input.fromEmail ?? "hello@siplat.co",
    host: input.host ?? null, port: input.port ?? null, username: input.username ?? null, configuredById: input.actorUserId ?? null, verified: false,
  };
  if (input.secret) data.secretEnc = encryptSecret(input.secret); // never stored or returned in plaintext
  const c = await prisma.emailConfig.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  invalidateEmailCache(); // the transport re-reads the new provider/secret on next send
  await recordAudit({ action: AUDIT.EMAIL_CONFIG_CHANGED, actorUserId: input.actorUserId, targetType: "EmailConfig", targetId: c.id, metadata: { provider: input.provider } });
  return { ok: true };
}

// -------- Support chat --------
export async function openSupportChat(input: { schoolId: string; subject: string; openedById?: string | null; withUserId?: string | null; message?: string }) {
  const chat = await prisma.supportChat.create({
    data: { schoolId: input.schoolId, subject: input.subject, openedById: input.openedById ?? null, withUserId: input.withUserId ?? null },
  });
  if (input.message) {
    await prisma.supportChatMessage.create({ data: { chatId: chat.id, senderId: input.openedById ?? null, senderRole: "support", body: input.message } });
  }
  await recordAudit({ action: AUDIT.SUPPORT_CHAT_OPENED, schoolId: input.schoolId, actorUserId: input.openedById, targetType: "SupportChat", targetId: chat.id });
  return { id: chat.id };
}
export async function postChatMessage(chatId: string, body: string, sender: { userId?: string | null; role: "support" | "tenant_admin" }) {
  const m = await prisma.supportChatMessage.create({ data: { chatId, senderId: sender.userId ?? null, senderRole: sender.role, body } });
  await prisma.supportChat.update({ where: { id: chatId }, data: { lastMessageAt: new Date(), status: "open" } });
  await recordAudit({ action: AUDIT.SUPPORT_CHAT_MESSAGE, actorUserId: sender.userId, targetType: "SupportChat", targetId: chatId });
  return { id: m.id };
}
export async function listSupportChats(schoolId?: string | null) {
  return prisma.supportChat.findMany({ where: schoolId ? { schoolId } : {}, orderBy: { lastMessageAt: "desc" }, take: 100, include: { messages: { orderBy: { at: "asc" } } } });
}

// -------- Reports --------
export async function generateReport(input: { type: string; scope?: string; schoolId?: string | null; format?: string; params?: any; actorUserId?: string | null }) {
  if (!isValidReportType(input.type)) throw new Error("unknown report type");
  // The route supplies the assembled data via params (usage/subscription/etc.);
  // buildReport turns it into sections + totals.
  const report = buildReport(input.type as ReportType, input.params ?? {});
  const run = await prisma.reportRun.create({
    data: {
      schoolId: input.schoolId ?? null, scope: input.scope ?? "platform", type: input.type,
      title: report.title, paramsJson: JSON.stringify(input.params ?? {}), format: input.format ?? "json",
      status: "ready", createdById: input.actorUserId ?? null,
    },
  });
  await recordAudit({ action: AUDIT.REPORT_GENERATED, schoolId: input.schoolId ?? null, actorUserId: input.actorUserId, targetType: "ReportRun", targetId: run.id, metadata: { type: input.type } });
  return { id: run.id, report };
}
export async function listReports(schoolId?: string | null) {
  return prisma.reportRun.findMany({ where: schoolId !== undefined ? { schoolId } : {}, orderBy: { createdAt: "desc" }, take: 100 });
}
