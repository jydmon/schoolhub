import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { canActOnTicket, ticketPublic } from "@/lib/support";
import { notify } from "@/lib/transport";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { ticketId: string } };
const STATUSES = ["open", "in_progress", "waiting", "resolved", "closed"];

async function loadOrThrow(ctx: any, ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new AppError("Ticket not found", 404);
  if (!canActOnTicket(ctx, ticket)) throw new AppError("You don't have access to this ticket.", 403);
  return ticket;
}

// Ticket detail + full message thread.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const ticket = await loadOrThrow(ctx, params.ticketId);
    const messages = await prisma.supportTicketMessage.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: "asc" } });
    return ok({ ticket: { ...ticketPublic(ticket), isOwner: ticket.userId === ctx.userId }, messages: messages.map((m) => ({ id: m.id, senderName: m.senderName, senderRole: m.senderRole, body: m.body, createdAt: m.createdAt, mine: m.senderUserId === ctx.userId })) });
  } catch (err) { return handleError(err); }
}

// Post a reply on the ticket.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const ticket = await loadOrThrow(ctx, params.ticketId);
    const body = String((await req.json().catch(() => ({}))).body || "").trim();
    if (!body) throw new AppError("Message body required", 400);
    const me = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { fullName: true } });
    const isRequester = ticket.userId === ctx.userId;
    const msg = await prisma.supportTicketMessage.create({ data: { ticketId: ticket.id, senderUserId: ctx.userId, senderName: me?.fullName || ctx.email, senderRole: isRequester ? "requester" : "support", body } });
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { updatedAt: new Date(), ...(isRequester && ticket.status === "resolved" ? { status: "open" } : {}) } });
    // Notify the other party.
    const notifyUserId = isRequester ? ticket.assignedToUserId : ticket.userId;
    if (notifyUserId && notifyUserId !== ctx.userId) await notify([notifyUserId], { kind: "support_ticket", title: `Reply on: ${ticket.subject}`, body: body.slice(0, 120), schoolId: ticket.schoolId }).catch(() => {});
    else if (isRequester && ticket.schoolId) {
      // No assignee yet — ping school admins.
      const { ROLES } = await import("@/lib/constants");
      const admins = await prisma.membership.findMany({ where: { schoolId: ticket.schoolId, role: { in: [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER] } }, select: { userId: true } });
      const ids = Array.from(new Set(admins.map((a) => a.userId))).filter((id) => id !== ctx.userId);
      if (ids.length) await notify(ids, { kind: "support_ticket", title: `Reply on: ${ticket.subject}`, body: body.slice(0, 120), schoolId: ticket.schoolId }).catch(() => {});
    }
    return ok({ message: { id: msg.id, body: msg.body, createdAt: msg.createdAt, mine: true, senderName: msg.senderName } }, 201);
  } catch (err) { return handleError(err); }
}

// Update status / priority / assignee (support side only).
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const ticket = await loadOrThrow(ctx, params.ticketId);
    if (ticket.userId === ctx.userId && !ctx.isPlatformAdmin) {
      // Requesters may only close their own ticket.
      const b = await req.json().catch(() => ({}));
      if (b.status !== "closed") throw new AppError("You can only close your own ticket.", 403);
      const t = await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: "closed" } });
      return ok({ ticket: ticketPublic(t) });
    }
    const b = await req.json().catch(() => ({}));
    const data: any = {};
    if (b.status && STATUSES.includes(b.status)) { data.status = b.status; if (b.status === "in_progress" && !ticket.assignedToUserId) data.assignedToUserId = ctx.userId; }
    if (b.priority) data.priority = b.priority;
    if ("assignToMe" in b && b.assignToMe) data.assignedToUserId = ctx.userId;
    const t = await prisma.supportTicket.update({ where: { id: ticket.id }, data });
    if (data.status && ticket.userId !== ctx.userId) await notify([ticket.userId], { kind: "support_ticket", title: `Your ticket is now "${data.status}"`, body: ticket.subject, schoolId: ticket.schoolId }).catch(() => {});
    return ok({ ticket: ticketPublic(t) });
  } catch (err) { return handleError(err); }
}
