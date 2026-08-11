import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { messagingConsentSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

// Parent-managed messaging consent for SMS and WhatsApp.
//   GET  → current status (number on file, WhatsApp opt-in, SMS opt-out)
//   POST → opt in / out of a channel, optionally set/confirm the mobile number.
// WhatsApp requires explicit opt-in before the school may message the parent;
// SMS is opt-out. Every change is audited.

export async function GET() {
  try {
    const ctx = await requireAuth();
    const u = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { phone: true, smsOptOut: true, whatsappOptIn: true, whatsappOptInAt: true } });
    const masked = u?.phone ? u.phone.replace(/.(?=.{4})/g, "•") : null;
    return ok({
      phone: masked,
      hasPhone: !!u?.phone,
      whatsapp: { optedIn: !!u?.whatsappOptIn, since: u?.whatsappOptInAt ?? null },
      sms: { optedOut: !!u?.smsOptOut },
    });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const i = messagingConsentSchema.parse(await req.json());

    // A first-time WhatsApp opt-in (or an SMS change) may include the number.
    const data: any = {};
    if (i.phone) data.phone = i.phone.trim();

    if (i.channel === "whatsapp") {
      data.whatsappOptIn = i.optIn;
      data.whatsappOptInAt = i.optIn ? new Date() : null;
    } else {
      // optIn === true means "receive SMS" → clear the opt-out flag.
      data.smsOptOut = !i.optIn;
    }

    // Require a number on file to opt in to either channel.
    const current = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { phone: true } });
    if (i.optIn && !i.phone && !current?.phone) {
      return ok({ error: "A mobile number is required to enable this channel." }, 400);
    }

    await prisma.user.update({ where: { id: ctx.userId }, data });

    const action = i.channel === "whatsapp"
      ? (i.optIn ? AUDIT.WHATSAPP_OPT_IN : AUDIT.WHATSAPP_OPT_OUT)
      : (i.optIn ? AUDIT.WHATSAPP_OPT_IN /* re-enable */ : AUDIT.SMS_OPT_OUT);
    await recordAudit({ action, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "MessagingConsent", targetId: ctx.userId, metadata: { channel: i.channel, optIn: i.optIn, numberChanged: !!i.phone } });

    return ok({ ok: true, channel: i.channel, optIn: i.optIn });
  } catch (err) { return handleError(err); }
}
