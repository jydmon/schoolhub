import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { sendEmail } from "@/lib/email";
import { handleError, ok, AppError } from "@/lib/http";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Send a test email through the currently-configured provider. On success the
// config is marked verified. Gated to the "comms" area (super-admin).
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "comms");
    const body = await req.json().catch(() => ({}));
    const to = String(body?.to ?? "").trim();
    if (!EMAIL_RE.test(to)) throw new AppError("A valid recipient email is required", 400);

    await sendEmail({
      to,
      subject: "SIPlat email test ✅",
      body: `<p>This is a test email from your SIPlat platform.</p><p>If you received this, your email provider is configured correctly and campaigns will now deliver.</p>`,
    });
    await prisma.emailConfig.update({ where: { id: "singleton" }, data: { verified: true } }).catch(() => {});
    return ok({ ok: true, sentTo: to });
  } catch (err) { return handleError(err); }
}
