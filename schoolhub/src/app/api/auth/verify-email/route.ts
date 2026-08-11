import { prisma } from "@/lib/db";
import { consumeVerificationToken, createVerificationToken } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { requireAuth } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";
import { z } from "zod";

const confirmSchema = z.object({ token: z.string().min(10) });

// Send (or resend) a verification email to the signed-in user.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const token = await createVerificationToken(ctx.userId, "email_verify", 60 * 24);
    const url = `${process.env.APP_URL ?? ""}/verify?token=${token}`;
    await sendEmail({
      to: ctx.email,
      subject: "Verify your SchoolHub email",
      body: `Confirm your email address: ${url}`,
    });
    return ok({ ok: true, message: "Verification email sent." });
  } catch (err) {
    return handleError(err);
  }
}

// Confirm an email with a token.
export async function POST(req: Request) {
  try {
    const { token } = confirmSchema.parse(await req.json());
    const row = await consumeVerificationToken(token, "email_verify");
    if (!row) return ok({ error: "Invalid or expired token" }, 400);
    await prisma.user.update({
      where: { id: row.userId },
      data: { emailVerified: true },
    });
    await recordAudit({ action: AUDIT.EMAIL_VERIFIED, actorUserId: row.userId });
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
