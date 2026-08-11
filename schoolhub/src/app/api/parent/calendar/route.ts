import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { handleError, ok } from "@/lib/http";

function feedUrl(token: string) {
  const base = process.env.APP_URL || "";
  return { httpUrl: `${base}/api/calendar/${token}`, webcalUrl: `${base.replace(/^https?:/, "webcal:")}/api/calendar/${token}` };
}

// Get (creating if needed) the parent's personal ICS subscription URL.
export async function GET() {
  try {
    const ctx = await requireAuth();
    let user = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { calendarToken: true } });
    let token = user?.calendarToken;
    if (!token) {
      token = randomBytes(20).toString("hex");
      await prisma.user.update({ where: { id: ctx.userId }, data: { calendarToken: token } });
    }
    return ok({ token, ...feedUrl(token) });
  } catch (err) {
    return handleError(err);
  }
}

// Regenerate the subscription token (revokes the old URL).
export async function POST() {
  try {
    const ctx = await requireAuth();
    const token = randomBytes(20).toString("hex");
    await prisma.user.update({ where: { id: ctx.userId }, data: { calendarToken: token } });
    return ok({ token, ...feedUrl(token) });
  } catch (err) {
    return handleError(err);
  }
}
