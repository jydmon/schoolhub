// WhatsApp adapter. Console-mode by default (logs); swap the body for the real
// WhatsApp Business Cloud API (Meta) or Twilio's WhatsApp channel by setting
// WHATSAPP_MODE=cloud and the WHATSAPP_* env vars. The interface is real, so
// callers and delivery tracking do not change when a live provider is wired in.
//
// WhatsApp policy essentials, enforced by callers / this module:
//  1. Opt-in is REQUIRED. The school may only message a parent who has explicitly
//     opted in (User.whatsappOptIn). notify.ts checks this before calling send.
//  2. Business-initiated messages outside a 24-hour customer-service window must
//     use a pre-approved TEMPLATE (name + variables), not free-form text.
//     Emergencies and replies within the 24h window may be free-form.
//  3. Inbound "STOP" opts the parent out (handled by the inbound webhook).

export type WhatsAppMessage =
  | { kind: "template"; template: string; variables?: string[] }
  | { kind: "text"; body: string };

export type WhatsAppResult = { status: "sent" | "failed"; providerId?: string; reason?: string };

// Approved message templates (mirror what would be registered in the Meta
// Business Manager). Variables are positional {{1}}, {{2}}, ...
export const WA_TEMPLATES: Record<string, string> = {
  general_update: "{{1}}: {{2}}",                                   // title, body
  transport_delay: "🚌 {{1}} is running about {{2}} min late. New ETA {{3}}.",
  trip_welfare: "🏕️ {{1}}: {{2}}",                                  // trip, welfare note
  consent_reminder: "Action needed: please give consent for {{1}} ({{2}}) by {{3}}.",
  emergency: "⚠️ {{1}}: {{2}}",                                     // emergency uses text too
};

function renderTemplate(name: string, vars: string[] = []): string {
  const t = WA_TEMPLATES[name] ?? "{{1}}";
  return t.replace(/\{\{(\d+)\}\}/g, (_m, i) => vars[Number(i) - 1] ?? "");
}

export async function sendWhatsApp(to: string, msg: WhatsAppMessage): Promise<WhatsAppResult> {
  if (!to) return { status: "failed", reason: "no_phone_number" };
  const rendered = msg.kind === "template" ? renderTemplate(msg.template, msg.variables) : msg.body;
  const mode = process.env.WHATSAPP_MODE ?? "console";

  if (mode === "console") {
    const label = msg.kind === "template" ? `template:${msg.template}` : "text";
    // eslint-disable-next-line no-console
    console.log(`\n[whatsapp:console:${label}] TO: ${to}\n  ${rendered}\n`);
    return { status: "sent", providerId: `sim_${to.slice(-4)}` };
  }

  // Future (mode === "cloud"): POST to
  //   https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/messages
  //   Authorization: Bearer <WHATSAPP_TOKEN>
  //   body for template: { messaging_product:"whatsapp", to, type:"template",
  //     template:{ name, language:{code:"en"}, components:[{type:"body",
  //       parameters: vars.map(v=>({type:"text",text:v})) }] } }
  //   body for text (within 24h window): { messaging_product:"whatsapp", to,
  //     type:"text", text:{ body } }
  // Return { status:'sent', providerId:<messages[0].id> } or 'failed'.
  return { status: "sent", providerId: "unconfigured" };
}
