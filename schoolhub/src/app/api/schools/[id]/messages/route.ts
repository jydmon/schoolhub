import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { messageSchema } from "@/lib/validation";
import { resolveRecipients, dispatch } from "@/lib/notify";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Communication history with per-message delivery counts.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_DASHBOARDS, params.id);
    const messages = await prisma.message.findMany({ where: { schoolId: params.id }, orderBy: { createdAt: "desc" }, take: 40 });
    const withCounts = await Promise.all(messages.map(async (m) => {
      const grouped = await prisma.notification.groupBy({ by: ["status"], where: { messageId: m.id }, _count: { _all: true } });
      const counts: Record<string, number> = {};
      grouped.forEach((g) => { counts[g.status] = g._count._all; });
      const read = await prisma.notification.count({ where: { messageId: m.id, read: true } });
      return { id: m.id, title: m.title, priority: m.priority, channels: m.channels, recipientCount: m.recipientCount, createdAt: m.createdAt, counts, read };
    }));
    return ok({ messages: withCounts });
  } catch (err) { return handleError(err); }
}

// Compose + send a message: resolve targeting → fan out across channels → track delivery.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_DASHBOARDS, params.id);
    const i = messageSchema.parse(await req.json());
    const channels = (i.channels?.length ? i.channels : ["inapp"]).join(",");

    const message = await prisma.message.create({
      data: { schoolId: params.id, senderUserId: ctx.userId, title: i.title, body: i.body || null, channels, priority: i.priority || "normal", targeting: JSON.stringify(i.target) },
    });
    const recipients = await resolveRecipients(params.id, i.target);
    const result = await dispatch({ id: message.id, schoolId: params.id, title: i.title, body: i.body, channels, priority: i.priority || "normal" }, recipients);

    await recordAudit({ action: AUDIT.MESSAGE_SENT, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Message", targetId: message.id, metadata: { target: i.target.type, priority: i.priority || "normal", recipients: result.recipients } });
    return ok({ message, ...result }, 201);
  } catch (err) { return handleError(err); }
}
