import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { manageableSchoolIds, ticketPublic } from "@/lib/support";
import { notify } from "@/lib/transport";
import { recordAudit } from "@/lib/audit";
import { ROLES } from "@/lib/constants";
import { handleError, ok, AppError } from "@/lib/http";

// List support tickets. ?scope=manage returns tickets for schools the caller
// administers (or all, for a platform admin); default returns the caller's own.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const scope = new URL(req.url).searchParams.get("scope") || "mine";
    let where: any = { userId: ctx.userId };
    let canManage = false;
    if (scope === "manage") {
      if (ctx.isPlatformAdmin) { where = {}; canManage = true; }
      else { const ids = manageableSchoolIds(ctx); canManage = ids.length > 0; where = { schoolId: { in: ids.length ? ids : ["_none_"] } }; }
    }
    const tickets = await prisma.supportTicket.findMany({ where, orderBy: { updatedAt: "desc" }, take: 200, include: { _count: { select: { messages: true } } } });
    return ok({ canManage, tickets: tickets.map((t) => ticketPublic(t, t._count.messages)) });
  } catch (err) { return handleError(err); }
}

// Raise a support ticket. Notifies the school's administrators.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const subject = String(b.subject || "").trim();
    const body = String(b.body || "").trim();
    if (!subject || !body) throw new AppError("A subject and a description are required.", 400);
    const me = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { fullName: true, email: true, memberships: { select: { schoolId: true } } } });
    const schoolId = b.schoolId || me?.memberships[0]?.schoolId || null;

    const ticket = await prisma.supportTicket.create({
      data: {
        schoolId, userId: ctx.userId, userEmail: me?.email || ctx.email, userName: me?.fullName || null,
        category: b.category || "question", priority: b.priority || "normal", subject, status: "open",
        messages: { create: { senderUserId: ctx.userId, senderName: me?.fullName || ctx.email, senderRole: "requester", body } },
      },
    });
    await recordAudit({ action: "SUPPORT_TICKET_CREATED", schoolId, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "SupportTicket", targetId: ticket.id, metadata: { category: ticket.category, subject } });

    // Notify the school's admins (in-app; email follows their notification prefs).
    if (schoolId) {
      const admins = await prisma.membership.findMany({ where: { schoolId, role: { in: [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER] } }, select: { userId: true } });
      const ids = Array.from(new Set(admins.map((a) => a.userId))).filter((id) => id !== ctx.userId);
      if (ids.length) await notify(ids, { kind: "support_ticket", title: `New support request: ${subject}`, body: `${me?.fullName || ctx.email} raised a ${ticket.category} ticket.`, schoolId }).catch(() => {});
    }
    return ok({ ticket: ticketPublic(ticket, 1) }, 201);
  } catch (err) { return handleError(err); }
}
