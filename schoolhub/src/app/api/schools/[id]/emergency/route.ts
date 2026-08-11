import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { emergencySchema } from "@/lib/validation";
import { resolveRecipients, dispatch } from "@/lib/notify";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Emergency escalation: broadcast a safety-critical alert to all parents & staff
// across every channel, overriding preferences and quiet hours.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_DASHBOARDS, params.id);
    const { title, body } = emergencySchema.parse(await req.json());

    const message = await prisma.message.create({ data: { schoolId: params.id, senderUserId: ctx.userId, title, body: body || null, channels: "inapp,push,email,sms,whatsapp", priority: "emergency", targeting: JSON.stringify({ type: "school", audience: "both" }) } });
    const recipients = await resolveRecipients(params.id, { type: "school", audience: "both" });
    const result = await dispatch({ id: message.id, schoolId: params.id, title, body, channels: "inapp,push,email,sms,whatsapp", priority: "emergency" }, recipients);

    await recordAudit({ action: AUDIT.EMERGENCY_ALERT, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Message", targetId: message.id, metadata: { recipients: result.recipients } });
    await recordAudit({ action: AUDIT.SAFEGUARDING, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, metadata: { emergency: true } });
    return ok({ ...result }, 201);
  } catch (err) { return handleError(err); }
}
