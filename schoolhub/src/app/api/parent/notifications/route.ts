import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { handleError, ok } from "@/lib/http";

// In-app notification feed for the current user (transport + trip updates).
export async function GET() {
  try {
    const ctx = await requireAuth();
    const notifications = await prisma.notification.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 50 });
    const unread = notifications.filter((n) => !n.read).length;
    return ok({ notifications, unread });
  } catch (err) { return handleError(err); }
}

// Mark notifications read, or acknowledge them (delivery tracking).
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const where = { userId: ctx.userId, ...(Array.isArray(body?.ids) ? { id: { in: body.ids } } : {}) };
    if (body?.acknowledge) {
      await prisma.notification.updateMany({ where, data: { read: true, status: "acknowledged", acknowledgedAt: new Date() } });
    } else {
      await prisma.notification.updateMany({ where, data: { read: true, status: "read" } });
    }
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
