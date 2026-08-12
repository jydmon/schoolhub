import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, ROLES } from "@/lib/constants";
import { notify } from "@/lib/transport";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Transport-office view of driver messaging. GET returns the thread for a driver
// (?driver=userId) or a summary across all drivers. POST sends a message to a
// driver (and drops an in-app notification).
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const driver = new URL(req.url).searchParams.get("driver");
    if (driver) {
      const messages = await prisma.driverMessage.findMany({ where: { schoolId: params.id, driverUserId: driver }, orderBy: { createdAt: "asc" }, take: 200 });
      // Mark driver→office messages as read now the office is viewing them.
      await prisma.driverMessage.updateMany({ where: { schoolId: params.id, driverUserId: driver, direction: "to_office", read: false }, data: { read: true } });
      return ok({ messages });
    }
    // Summary: unread (to_office) counts + last message per driver.
    const memberships = await prisma.membership.findMany({ where: { schoolId: params.id, role: ROLES.DRIVER }, include: { user: { select: { id: true, fullName: true } } } });
    const all = await prisma.driverMessage.findMany({ where: { schoolId: params.id }, orderBy: { createdAt: "desc" } });
    const threads = memberships.map((m) => {
      const mine = all.filter((x) => x.driverUserId === m.user.id);
      return { driverId: m.user.id, driverName: m.user.fullName, last: mine[0] || null, unread: mine.filter((x) => x.direction === "to_office" && !x.read).length, total: mine.length };
    });
    return ok({ threads, totalUnread: threads.reduce((s, t) => s + t.unread, 0) });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const b = await req.json().catch(() => ({}));
    if (!b.driverUserId || !String(b.body || "").trim()) return ok({ error: "driverUserId and body required" }, 400);
    const msg = await prisma.driverMessage.create({
      data: { schoolId: params.id, driverUserId: String(b.driverUserId), direction: "to_driver", senderUserId: ctx.userId, senderName: ctx.email, body: String(b.body).trim() },
    });
    await notify([String(b.driverUserId)], { kind: "transport_message", title: "Message from the transport office", body: String(b.body).trim().slice(0, 120), schoolId: params.id }).catch(() => {});
    return ok({ message: msg }, 201);
  } catch (err) { return handleError(err); }
}
