import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { manageableSchoolIds } from "@/lib/support";
import { serializeTicket, makeReference, slaTarget, normalizePriority, normalizeSeverity } from "@/lib/support-tickets";
import { notify } from "@/lib/transport";
import { recordAudit } from "@/lib/audit";
import { ROLES } from "@/lib/constants";
import { handleError, ok, AppError } from "@/lib/http";

// Cap inline attachments so a screenshot upload can't bloat the row.
const MAX_ATTACH = 4;
const MAX_ATTACH_CHARS = 2_200_000; // ~1.6MB base64
function cleanAttachments(input: any): { name: string; type: string; dataUrl: string }[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, MAX_ATTACH).map((a) => ({
    name: String(a?.name || "attachment").slice(0, 120),
    type: String(a?.type || "").slice(0, 60),
    dataUrl: typeof a?.dataUrl === "string" && a.dataUrl.length <= MAX_ATTACH_CHARS ? a.dataUrl : "",
  })).filter((a) => a.dataUrl);
}

// List support tickets. ?scope=manage returns tickets for schools the caller
// administers (all, for a platform admin); default returns the caller's own.
// Optional filters: status, priority, q (subject/reference).
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const sp = new URL(req.url).searchParams;
    const scope = sp.get("scope") || "mine";
    let where: any = { userId: ctx.userId };
    let canManage = false;
    if (scope === "manage") {
      if (ctx.isPlatformAdmin) { where = {}; canManage = true; }
      else { const ids = manageableSchoolIds(ctx); canManage = ids.length > 0; where = { schoolId: { in: ids.length ? ids : ["_none_"] } }; }
    }
    const status = sp.get("status"); if (status) where.status = status;
    const priority = sp.get("priority"); if (priority) where.priority = { in: priority === "medium" ? ["medium", "normal"] : priority === "critical" ? ["critical", "urgent"] : [priority] };
    const q = sp.get("q")?.trim(); if (q) where.OR = [{ subject: { contains: q, mode: "insensitive" } }, { reference: { contains: q.toUpperCase() } }];

    const tickets = await prisma.supportTicket.findMany({ where, orderBy: [{ escalated: "desc" }, { updatedAt: "desc" }], take: 300, include: { _count: { select: { messages: true } } } });

    // Resolve assignee names in one query.
    const assigneeIds = Array.from(new Set(tickets.map((t) => t.assignedToUserId).filter(Boolean))) as string[];
    const assignees = assigneeIds.length ? await prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, fullName: true } }) : [];
    const nameById = new Map(assignees.map((u) => [u.id, u.fullName]));

    return ok({ canManage, tickets: tickets.map((t) => ({ ...serializeTicket(t, t._count.messages), assignedToName: t.assignedToUserId ? nameById.get(t.assignedToUserId) || null : null })) });
  } catch (err) { return handleError(err); }
}

// Raise a support ticket. Generates a reference + SLA target and notifies admins.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const subject = String(b.subject || "").trim();
    const body = String(b.body || "").trim();
    if (!subject || !body) throw new AppError("A subject and a description are required.", 400);
    const me = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { fullName: true, email: true, memberships: { select: { schoolId: true } } } });
    const schoolId = b.schoolId || me?.memberships[0]?.schoolId || null;
    const priority = normalizePriority(b.priority);
    const now = new Date();
    const attachments = cleanAttachments(b.attachments);

    const created = await prisma.supportTicket.create({
      data: {
        schoolId, userId: ctx.userId, userEmail: me?.email || ctx.email, userName: me?.fullName || null,
        category: b.category || "question", subcategory: b.subcategory || null, priority, severity: normalizeSeverity(b.severity), subject, status: "open",
        slaDueAt: slaTarget(priority, now),
        messages: { create: { senderUserId: ctx.userId, senderName: me?.fullName || ctx.email, senderRole: "requester", body, attachmentsJson: JSON.stringify(attachments) } },
      },
    });
    // Backfill the human reference from the generated id.
    const ticket = await prisma.supportTicket.update({ where: { id: created.id }, data: { reference: makeReference(created.id) } });
    await recordAudit({ action: "SUPPORT_TICKET_CREATED", schoolId, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "SupportTicket", targetId: ticket.id, metadata: { reference: ticket.reference, category: ticket.category, priority, subject } });

    if (schoolId) {
      const admins = await prisma.membership.findMany({ where: { schoolId, role: { in: [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.SUPPORT_STAFF] } }, select: { userId: true } });
      const ids = Array.from(new Set(admins.map((a) => a.userId))).filter((id) => id !== ctx.userId);
      if (ids.length) await notify(ids, { kind: "support_ticket", title: `New ${priority} support request ${ticket.reference}`, body: `${me?.fullName || ctx.email}: ${subject}`, schoolId }).catch(() => {});
    }
    return ok({ ticket: serializeTicket(ticket, 1) }, 201);
  } catch (err) { return handleError(err); }
}
