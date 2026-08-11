import { prisma } from "@/lib/db";
import {
  createVerificationToken,
  consumeVerificationToken,
  hashPassword,
} from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, clientIp, ok } from "@/lib/http";
import { z } from "zod";

const requestSchema = z.object({ email: z.string().email() });
const confirmSchema = z.object({ token: z.string().min(10), password: z.string().min(8) });

// Request a password reset. Always returns 200 (no account enumeration).
export async function POST(req: Request) {
  try {
    const { email } = requestSchema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user) {
      const token = await createVerificationToken(user.id, "password_reset", 60);
      const url = `${process.env.APP_URL ?? ""}/reset?token=${token}`;
      await sendEmail({
        to: user.email,
        subject: "Reset your SchoolHub password",
        body: `Use this link to reset your password (valid 1 hour): ${url}`,
      });
      await recordAudit({
        action: AUDIT.PASSWORD_RESET_REQUESTED,
        actorUserId: user.id,
        actorEmail: user.email,
        ip: clientIp(req),
      });
    }
    return ok({ ok: true, message: "If the account exists, a reset link has been sent." });
  } catch (err) {
    return handleError(err);
  }
}

// Confirm a password reset with a token.
export async function PUT(req: Request) {
  try {
    const { token, password } = confirmSchema.parse(await req.json());
    const row = await consumeVerificationToken(token, "password_reset");
    if (!row) return ok({ error: "Invalid or expired token" }, 400);
    await prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: await hashPassword(password) },
    });
    await recordAudit({
      action: AUDIT.PASSWORD_RESET_COMPLETED,
      actorUserId: row.userId,
      ip: clientIp(req),
    });
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
