import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { ROLES } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

// A driver's two-way thread with the transport office.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const messages = await prisma.driverMessage.findMany({ where: { driverUserId: ctx.userId }, orderBy: { createdAt: "asc" }, take: 200 });
    await prisma.driverMessage.updateMany({ where: { driverUserId: ctx.userId, direction: "to_driver", read: false }, data: { read: true } });
    return ok({ messages });
  } catch (err) { return handleError(err); }
}

// Driver sends a message to the transport office.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    if (!String(b.body || "").trim()) return ok({ error: "Message body required" }, 400);
    const membership = await prisma.membership.findFirst({ where: { userId: ctx.userId, role: ROLES.DRIVER } });
    const schoolId = membership?.schoolId;
    if (!schoolId) return ok({ error: "No driver school found" }, 400);
    const msg = await prisma.driverMessage.create({
      data: { schoolId, driverUserId: ctx.userId, direction: "to_office", senderUserId: ctx.userId, senderName: ctx.email, body: String(b.body).trim() },
    });
    return ok({ message: msg }, 201);
  } catch (err) { return handleError(err); }
}
