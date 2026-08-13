import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { canActOnTicket } from "@/lib/support";
import { serializeTicket, statusTransition, slaTarget, normalizePriority, normalizeSeverity, TICKET_STATUSES, TERMINAL } from "@/lib/support-tickets";
import { notify } from "@/lib/transport";
import { recordAudit } from "@/lib/audit";
import { ROLES } from "@/lib/constants";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { ticketId: string } };

const MAX_ATTACH = 4;
const MAX_ATTACH_CHARS = 2_200_000;
function cleanAttachments(input: any): { name: string; type: string; dataUrl: string }[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, MAX_ATTACH).map((a) => ({ name: String(a?.name || "attachment").slice(0, 120), type: String(a?.type || "").slice(0, 60), dataUrl: typeof a?.dataUrl === "string" && a.dataUrl.length <= MAX_ATTACH_CHARS ? a.dataUrl : "" })).filter((a) => a.dataUrl);
}
function parseAttachments(json: string | null): any[] { try { const a = JSON.parse(json || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } }

async function loadOrThrow(ctx: any, ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new AppError("Ticket not found", 404);
  if (!canActOnTicket(ctx, ticket)) throw new AppError("You don't have access to this ticket.", 403);
  return ticket;
}

// Ticket detail + thread. Internal notes are hidden from the requester.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const ticket = await loadOrThrow(ctx, params.ticketId);
    const isOwner = ticket.userId === ctx.userId;
    const canManage = !isOwner || ctx.isPlatformAdmin;
    const messages = await prisma.supportTicketMessage.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: "asc" } });
    const visible = messages.filter((m) => canManage || !m.internal);
    const assignee = ticket.assignedToUserId ? await prisma.user.findUnique({ where: { id: ticket.assignedToUserId }, select: { fullName: true } }) : null;
    return ok({
      ticket: { ...serializeTicket(ticket), isOwner, canManage, assignedToName: assignee?.fullName || null },
      messages: visible.map((m) => ({ id: m.id, senderName: m.senderName, senderRole: m.senderRole, body: m.body, internal: m.internal, attachments: parseAttachments(m.attachmentsJson), createdAt: m.createdAt, mine: m.senderUserId === ctx.userId })),
    });
  } catch (err) { return handleError(err); }
}

// Post a reply or an internal note (internal notes are support-only).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const ticket = await loadOrThrow(ctx, params.ticketId);
    const b = await req.json().catch(() => ({}));
    const body = String(b.body || "").trim();
    const attachments = cleanAttachments(b.attachments);
    if (!body && !attachments.length) throw new AppError("Message body required", 400);
    const isRequester = ticket.userId === ctx.userId;
    const internal = !!b.internal && !isRequester;
    const me = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { fullName: true } });

    const msg = await prisma.supportTicketMessage.create({ data: { ticketId: ticket.id, senderUserId: ctx.userId, senderName: me?.fullName || ctx.email, senderRole: isRequester ? "requester" : "support", body: body || "(attachment)", internal, attachmentsJson: JSON.stringify(attachments) } });

    // Update ticket state around the reply.
    const upd: any = { updatedAt: new Date() };
    if (!internal && !isRequester) { if (!ticket.firstResponseAt) upd.firstResponseAt = new Date(); if (ticket.status === "open") { upd.status = "acknowledged"; if (!ticket.acknowledgedAt) upd.acknowledgedAt = new Date(); } }
    if (isRequester && TERMINAL.has(ticket.status)) upd.status = "reopened";
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: upd });

    if (!internal) {
      const notifyUserId = isRequester ? ticket.assignedToUserId : ticket.userId;
      if (notifyUserId && notifyUserId !== ctx.userId) await notify([notifyUserId], { kind: "support_ticket", title: `Reply on ${ticket.reference || ticket.subject}`, body: (body || "attachment").slice(0, 120), schoolId: ticket.schoolId }).catch(() => {});
      else if (isRequester && ticket.schoolId) {
        const admins = await prisma.membership.findMany({ where: { schoolId: ticket.schoolId, role: { in: [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.SUPPORT_STAFF] } }, select: { userId: true } });
        const ids = Array.from(new Set(admins.map((a) => a.userId))).filter((id) => id !== ctx.userId);
        if (ids.length) await notify(ids, { kind: "support_ticket", title: `Reply on ${ticket.reference || ticket.subject}`, body: (body || "attachment").slice(0, 120), schoolId: ticket.schoolId }).catch(() => {});
      }
    }
    return ok({ message: { id: msg.id, body: msg.body, internal, attachments, createdAt: msg.createdAt, mine: true, senderName: msg.senderName } }, 201);
  } catch (err) { return handleError(err); }
}

// Update status / priority / assignment / escalation.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const ticket = await loadOrThrow(ctx, params.ticketId);
    const b = await req.json().catch(() => ({}));
    const isRequester = ticket.userId === ctx.userId;

    // Requesters may only close or reopen their own ticket.
    if (isRequester && !ctx.isPlatformAdmin) {
      if (b.status === "closed") { const t = await prisma.supportTicket.update({ where: { id: ticket.id }, data: statusTransition("closed", ticket) }); return ok({ ticket: serializeTicket(t) }); }
      if (b.status === "reopened") { const t = await prisma.supportTicket.update({ where: { id: ticket.id }, data: statusTransition("reopened", ticket) }); return ok({ ticket: serializeTicket(t) }); }
      throw new AppError("You can only close or reopen your own ticket.", 403);
    }

    const data: any = {};
    if (b.status && (TICKET_STATUSES as readonly string[]).includes(b.status)) {
      Object.assign(data, statusTransition(b.status, ticket));
      if ((b.status === "in_progress" || b.status === "assigned") && !ticket.assignedToUserId && !b.assignToUserId) data.assignedToUserId = ctx.userId;
    }
    if (b.priority) { const pr = normalizePriority(b.priority); data.priority = pr; if (!TERMINAL.has(b.status || ticket.status)) data.slaDueAt = slaTarget(pr, new Date(ticket.createdAt)); }
    if (b.assignToMe) data.assignedToUserId = ctx.userId;
    if (typeof b.assignToUserId === "string") data.assignedToUserId = b.assignToUserId || null;
    if ("escalated" in b) { data.escalated = !!b.escalated; }
    if (b.subcategory !== undefined) data.subcategory = b.subcategory || null;
    if (b.category) data.category = String(b.category);
    if (b.severity) data.severity = normalizeSeverity(b.severity);

    const t = await prisma.supportTicket.update({ where: { id: ticket.id }, data });
    await recordAudit({ action: "SUPPORT_TICKET_UPDATED", schoolId: ticket.schoolId, actorUserId: ctx.userId, targetType: "SupportTicket", targetId: ticket.id, metadata: { changes: Object.keys(data), reference: ticket.reference } });

    // B2: escalation routes the ticket to the Super-Admin platform queue —
    // notify every platform admin (they already see all tickets in Manage).
    if (data.escalated === true && !ticket.escalated) {
      const admins = await prisma.user.findMany({ where: { isPlatformAdmin: true }, select: { id: true } });
      const ids = admins.map((a) => a.id).filter((id) => id !== ctx.userId);
      if (ids.length) await notify(ids, { kind: "support_ticket", title: `Escalated: ${ticket.reference || ticket.subject}`, body: `${ticket.subject} — escalated to platform support.`, schoolId: ticket.schoolId }).catch(() => {});
    }
    // Notify the requester of meaningful changes.
    if ((data.status || data.escalated) && ticket.userId !== ctx.userId) {
      await notify([ticket.userId], { kind: "support_ticket", title: data.escalated ? `Ticket ${ticket.reference} escalated` : `Ticket ${ticket.reference} is now "${(data.status || ticket.status).replace(/_/g, " ")}"`, body: ticket.subject, schoolId: ticket.schoolId }).catch(() => {});
    }
    return ok({ ticket: serializeTicket(t) });
  } catch (err) { return handleError(err); }
}
