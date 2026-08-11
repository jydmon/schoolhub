import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { NextResponse } from "next/server";

// Public inbound webhook for the WhatsApp Business / SMS provider.
//   GET  → provider verification handshake (Meta sends hub.challenge).
//   POST → inbound events: STOP/START keywords (consent) and delivery receipts.
// Authenticated by a shared verify token (WHATSAPP_VERIFY_TOKEN). In production
// you would additionally verify the provider's request signature.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? "schoolhub-verify";
  if (mode === "subscribe" && token === expected) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

// Normalise both a simple test payload ({ from, text, channel }) and the shape a
// real provider would send (delivery statuses + inbound messages).
function parseEvents(payload: any): { from?: string; text?: string; status?: string; providerId?: string }[] {
  if (!payload) return [];
  if (payload.from || payload.text || payload.status) return [payload];
  const out: any[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      for (const m of v.messages ?? []) out.push({ from: m.from, text: m.text?.body });
      for (const s of v.statuses ?? []) out.push({ from: s.recipient_id, status: s.status, providerId: s.id });
    }
  }
  return out;
}

export async function POST(req: Request) {
  let payload: any = null;
  try { payload = await req.json(); } catch { payload = null; }
  const events = parseEvents(payload);
  let optOuts = 0, optIns = 0, receipts = 0;

  for (const e of events) {
    // Delivery receipt → reconcile the matching notification's status.
    if (e.status) {
      receipts++;
      const map: Record<string, string> = { delivered: "delivered", read: "read", sent: "sent", failed: "failed", undelivered: "failed" };
      if (e.providerId && map[e.status]) {
        await prisma.notification.updateMany({ where: { channel: { in: ["whatsapp", "sms"] }, providerId: e.providerId }, data: { status: map[e.status] } }).catch(() => {});
      }
      continue;
    }

    // Inbound keyword → consent change. Match the sender's number to a user.
    const text = (e.text || "").trim().toUpperCase();
    if (!e.from || !text) continue;
    const digits = e.from.replace(/[^\d]/g, "").slice(-9); // last 9 digits, format-agnostic
    const user = await prisma.user.findFirst({ where: { phone: { contains: digits } }, select: { id: true, email: true } });
    if (!user) continue;

    if (["STOP", "UNSUBSCRIBE", "CANCEL"].includes(text)) {
      await prisma.user.update({ where: { id: user.id }, data: { whatsappOptIn: false, smsOptOut: true, whatsappOptInAt: null } });
      await recordAudit({ action: AUDIT.WHATSAPP_OPT_OUT, actorUserId: user.id, actorEmail: user.email, targetType: "MessagingConsent", targetId: user.id, metadata: { via: "inbound_keyword", keyword: text } });
      optOuts++;
    } else if (["START", "SUBSCRIBE", "YES", "UNSTOP"].includes(text)) {
      await prisma.user.update({ where: { id: user.id }, data: { whatsappOptIn: true, smsOptOut: false, whatsappOptInAt: new Date() } });
      await recordAudit({ action: AUDIT.WHATSAPP_OPT_IN, actorUserId: user.id, actorEmail: user.email, targetType: "MessagingConsent", targetId: user.id, metadata: { via: "inbound_keyword", keyword: text } });
      optIns++;
    }
  }

  return NextResponse.json({ ok: true, processed: events.length, optOuts, optIns, receipts });
}
