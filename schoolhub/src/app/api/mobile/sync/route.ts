import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { handleError, ok } from "@/lib/http";

// Delta sync for background/foreground refresh. The app stores `serverTime` from
// the last sync and passes it back as ?since= to fetch only what changed. Writes
// made offline are replayed by the app against the normal idempotent endpoints
// (boarding, consent, headcount upserts), so conflicts resolve to last-write.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const sinceParam = new URL(req.url).searchParams.get("since");
    const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 7 * 864e5);

    const notifications = await prisma.notification.findMany({
      where: { userId: ctx.userId, createdAt: { gt: since } },
      orderBy: { createdAt: "desc" }, take: 100,
    });
    const unread = await prisma.notification.count({ where: { userId: ctx.userId, read: false } });

    return ok({
      serverTime: new Date().toISOString(),
      unread,
      notifications: notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, kind: n.kind, read: n.read, createdAt: n.createdAt })),
    });
  } catch (err) { return handleError(err); }
}
