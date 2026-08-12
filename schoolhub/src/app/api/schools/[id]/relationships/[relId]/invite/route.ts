import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { issueInvite } from "@/lib/guardian-relationships";
import { sendEmail } from "@/lib/email";
import { getEmailConfig } from "@/lib/platform-ops";
import { sendSms } from "@/lib/sms";
import { sendWhatsApp } from "@/lib/whatsapp";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; relId: string } };
const APP_URL = () => (process.env.APP_URL || "https://app.siplat.co").replace(/\/+$/, "");
const CHANNELS = ["email", "sms", "whatsapp"];
const ipOf = (req: Request) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

// Issue (or reissue) the verification invitation to the guardian, and deliver
// the one-time link over the chosen channels — honestly reporting each result.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const b = await req.json().catch(() => ({}));
    const channels: string[] = Array.isArray(b.channels) && b.channels.length ? b.channels.filter((c: string) => CHANNELS.includes(c)) : ["email"];

    const { relationship, link, reissue } = await issueInvite(params.id, params.relId, { userId: ctx.userId, email: ctx.email, role: "school", ip: ipOf(req) }, { appUrl: APP_URL() });

    const email = relationship.guardianEmail;
    const phone = relationship.guardianPhone;
    const name = relationship.guardianName;
    const text = `Hello ${name}, ${relationship.schoolName || "your school"} has set up parent-portal access for your child. To verify your identity and activate access, open: ${link}`;
    const results: { channel: string; status: "sent" | "skipped" | "failed"; detail: string }[] = [];

    if (channels.includes("email")) {
      const cfg = await getEmailConfig();
      if (!cfg || cfg.provider === "console") {
        results.push({ channel: "email", status: "failed", detail: "No live email provider is configured, so nothing was actually sent. A super-admin must set one under Platform comms → Email for verification emails to arrive." });
      } else {
        try {
          await sendEmail({ to: email, subject: "Verify your identity to access your school's parent portal", body: `<p>Hello ${name},</p><p>Your school has set up parent-portal access linked to your child. For your child's safety we need you to verify your identity before access is granted.</p><p><a href="${link}">Verify and activate access</a></p><p>This secure link expires in 14 days. If you weren't expecting this, please contact the school office.</p>` });
          results.push({ channel: "email", status: "sent", detail: `Sent to ${email} via ${cfg.provider}.` });
        } catch (e: any) {
          results.push({ channel: "email", status: "failed", detail: `Email provider error: ${e?.message || "unknown"}.` });
        }
      }
    }
    if (channels.includes("sms")) {
      if (!phone) results.push({ channel: "sms", status: "skipped", detail: "No mobile number on file for this guardian." });
      else { const r = await sendSms(phone, text); results.push({ channel: "sms", status: r.status === "sent" ? "sent" : "failed", detail: r.status === "sent" ? `Sent to ${phone}.` : `SMS failed (${r.reason || "provider not configured"}).` }); }
    }
    if (channels.includes("whatsapp")) {
      if (!phone) results.push({ channel: "whatsapp", status: "skipped", detail: "No mobile number on file for this guardian." });
      else { const r = await sendWhatsApp(phone, { kind: "text", body: text }); results.push({ channel: "whatsapp", status: r.status === "sent" ? "sent" : "failed", detail: r.status === "sent" ? `Sent to ${phone}.` : `WhatsApp failed (${r.reason || "provider not configured"}).` }); }
    }

    const anySent = results.some((r) => r.status === "sent");
    return ok({ relationship, reissue, link, results, status: anySent ? "invited" : "not_delivered", message: anySent ? `Verification invitation ${reissue ? "reissued" : "sent"} to ${name}.` : "Invitation recorded, but nothing was delivered — see the per-channel detail. You can copy the secure link and share it another way." });
  } catch (err) { return handleError(err); }
}
