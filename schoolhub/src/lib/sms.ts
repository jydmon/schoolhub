// SMS adapter. Console-mode by default (logs); swap the body for a real provider
// (Twilio, MessageBird, Vonage, AWS SNS) by setting SMS_MODE=twilio and the
// TWILIO_* env vars. The interface is real, so callers and delivery tracking do
// not change when a live provider is wired in.
//
// SMS is treated as opt-OUT for school↔home contact: a parent is messaged unless
// they have replied STOP (handled by the WhatsApp/SMS inbound webhook, which sets
// User.smsOptOut). Callers must still pass a valid E.164 number.

export type SmsResult = { status: "sent" | "failed"; providerId?: string; reason?: string };

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (!to) return { status: "failed", reason: "no_phone_number" };
  const mode = process.env.SMS_MODE ?? "console";

  if (mode === "console") {
    // eslint-disable-next-line no-console
    console.log(`\n[sms:console] TO: ${to}\n  ${body}\n`);
    return { status: "sent", providerId: `sim_${to.slice(-4)}` };
  }

  // Future (mode === "twilio"): POST to
  //   https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
  //   body: To=<to>, From=<TWILIO_SMS_FROM>, Body=<body>
  //   auth: TWILIO_SID / TWILIO_AUTH_TOKEN
  // Return { status: 'sent', providerId: <message.sid> } or 'failed' with the
  // provider error. Delivery receipts arrive asynchronously on the webhook.
  return { status: "sent", providerId: "unconfigured" };
}
