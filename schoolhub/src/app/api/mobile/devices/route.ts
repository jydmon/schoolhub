import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { deviceSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

// Register (or refresh) a mobile device's push token. Called by the app on
// launch and whenever the FCM/APNs token rotates.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const i = deviceSchema.parse(await req.json());
    const device = await prisma.device.upsert({
      where: { pushToken: i.pushToken },
      update: { userId: ctx.userId, platform: i.platform, appRole: i.appRole || "parent", appVersion: i.appVersion || null, lastSeenAt: new Date() },
      create: { userId: ctx.userId, platform: i.platform, pushToken: i.pushToken, appRole: i.appRole || "parent", appVersion: i.appVersion || null },
    });
    await recordAudit({ action: AUDIT.DEVICE_REGISTERED, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Device", targetId: device.id, metadata: { platform: i.platform, appRole: device.appRole } });
    return ok({ device: { id: device.id, platform: device.platform, appRole: device.appRole } }, 201);
  } catch (err) { return handleError(err); }
}

// Unregister a device (logout / disable notifications) — ?pushToken=...
export async function DELETE(req: Request) {
  try {
    const ctx = await requireAuth();
    const token = new URL(req.url).searchParams.get("pushToken");
    if (!token) return ok({ error: "pushToken required" }, 400);
    await prisma.device.deleteMany({ where: { pushToken: token, userId: ctx.userId } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
