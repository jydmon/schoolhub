import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, ROLES } from "@/lib/constants";
import { createInvitation } from "@/lib/invitations";
import { hashPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { getEmailConfig } from "@/lib/platform-ops";
import { sendSms } from "@/lib/sms";
import { sendWhatsApp } from "@/lib/whatsapp";
import { notify } from "@/lib/transport";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string; guardianId: string } };
const APP_URL = () => (process.env.APP_URL || "https://app.siplat.co").replace(/\/+$/, "");
const CHANNELS = ["email", "push", "sms", "whatsapp"];

// Invite a parent/guardian to the platform across the chosen channels, honestly
// reporting what actually happened on each. Optionally set a temporary password
// so a not-yet-registered parent can sign in straight away (and is prompted to
// change it). If they already have an active account, the temp password is
// ignored and they're told they're already on the platform.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const b = await req.json().catch(() => ({}));
    const channels: string[] = Array.isArray(b.channels) && b.channels.length ? b.channels.filter((c: string) => CHANNELS.includes(c)) : ["email"];
    const tempPassword: string | null = typeof b.tempPassword === "string" && b.tempPassword.trim().length >= 6 ? b.tempPassword.trim() : null;

    const user = await prisma.user.findFirst({
      where: { id: params.guardianId, memberships: { some: { schoolId: params.id, role: ROLES.PARENT } } },
      include: { guardianLinks: { where: { schoolId: params.id }, include: { student: { select: { reference: true } } } } },
    });
    if (!user) throw new AppError("Guardian not found", 404);

    if (user.status === "active" && user.passwordHash) {
      return ok({ status: "already_on_platform", message: `${user.fullName} already has an active account — they'll see this in-app. (Any temporary password is ignored.)`, results: [] });
    }

    const studentRefs = user.guardianLinks.map((g) => g.student?.reference).filter(Boolean) as string[];
    const { activationLink } = await createInvitation({
      schoolId: params.id, email: user.email, role: ROLES.PARENT, studentRefs,
      invitedById: ctx.userId, actorEmail: ctx.email,
    });
    const link = `${APP_URL()}${activationLink}`;

    // Temporary password → let them sign in immediately and prompt a change.
    let tempPasswordSet = false;
    if (tempPassword) {
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(tempPassword), status: "active", emailVerified: true, mustChangePassword: true } });
      tempPasswordSet = true;
    }

    const results: { channel: string; status: "sent" | "skipped" | "failed"; detail: string }[] = [];
    const text = `Hello ${user.fullName}, your school has invited you to the SIPlat parent portal. Activate here: ${link}${tempPasswordSet ? " — or sign in with the temporary password your school gave you and change it in Settings." : ""}`;

    if (channels.includes("email")) {
      const cfg = await getEmailConfig();
      if (!cfg || cfg.provider === "console") {
        results.push({ channel: "email", status: "failed", detail: "No live email provider is configured, so nothing was actually sent. A super-admin must set one under Platform comms → Email (and run the test) for invitation emails to arrive." });
      } else {
        try {
          await sendEmail({ to: user.email, subject: "You're invited to your school's SIPlat parent portal", body: `<p>Hello ${user.fullName},</p><p>Your school has invited you to the SIPlat parent portal, where you can see your child's updates, reports, trips and more.</p><p><a href="${link}">Activate your account</a></p>${tempPasswordSet ? "<p>You can also sign in with the temporary password your school gave you, then change it in Settings.</p>" : ""}` });
          results.push({ channel: "email", status: "sent", detail: `Sent to ${user.email} via ${cfg.provider}${cfg.verified ? "" : " (provider not yet verified — send a test if it doesn't arrive)"}.` });
        } catch (e: any) {
          results.push({ channel: "email", status: "failed", detail: `Email provider error: ${e?.message || "unknown"}.` });
        }
      }
    }

    if (channels.includes("push")) {
      try { await notify([user.id], { kind: "invite", title: "You've been invited to the parent portal", body: "Activate your account to see your child's updates.", schoolId: params.id }); results.push({ channel: "push", status: "sent", detail: "Added to their in-app inbox; a device push is delivered if they've installed the app." }); }
      catch { results.push({ channel: "push", status: "failed", detail: "Could not queue the in-app notification." }); }
    }

    if (channels.includes("sms")) {
      if (!user.phone) results.push({ channel: "sms", status: "skipped", detail: "No mobile number on file for this parent." });
      else { const r = await sendSms(user.phone, text); results.push({ channel: "sms", status: r.status === "sent" ? "sent" : "failed", detail: r.status === "sent" ? `Sent to ${user.phone}.` : `SMS failed (${r.reason || "provider not configured"}).` }); }
    }

    if (channels.includes("whatsapp")) {
      if (!user.phone) results.push({ channel: "whatsapp", status: "skipped", detail: "No mobile number on file for this parent." });
      else { const r = await sendWhatsApp(user.phone, { kind: "text", body: text }); results.push({ channel: "whatsapp", status: r.status === "sent" ? "sent" : "failed", detail: r.status === "sent" ? `Sent to ${user.phone}.` : `WhatsApp failed (${r.reason || "provider not configured"}).` }); }
    }

    const anySent = results.some((r) => r.status === "sent");
    return ok({
      status: anySent ? "invited" : "not_delivered",
      tempPasswordSet,
      results,
      message: anySent ? `Invitation processed for ${user.fullName}.` : `Invitation recorded, but nothing was delivered — see the per-channel detail.`,
    });
  } catch (err) { return handleError(err); }
}
