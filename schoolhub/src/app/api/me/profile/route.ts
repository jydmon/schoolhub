import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { ROLE_LABELS } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

// The signed-in user's own profile (distinct from school configuration).
export async function GET() {
  try {
    const ctx = await requireAuth();
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      include: { memberships: { include: { school: { select: { name: true } } } } },
    });
    if (!user) return ok({ error: "Not found" }, 404);
    return ok({
      profile: {
        id: user.id, email: user.email, fullName: user.fullName, phone: user.phone,
        photoUrl: user.photoUrl, mfaEnabled: user.mfaEnabled, status: user.status,
        isPlatformAdmin: user.isPlatformAdmin,
        roles: Array.from(new Set(user.memberships.map((m) => ROLE_LABELS[m.role] ?? m.role))),
        schools: Array.from(new Set(user.memberships.map((m) => m.school?.name).filter(Boolean))),
      },
    });
  } catch (err) { return handleError(err); }
}

// Update own name / phone / photo. Email + role are not self-editable.
export async function PATCH(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const data: any = {};
    if (typeof b.fullName === "string" && b.fullName.trim().length >= 2) data.fullName = b.fullName.trim();
    if (typeof b.phone === "string") data.phone = b.phone.trim() || null;
    if (typeof b.photoUrl === "string") data.photoUrl = b.photoUrl.trim() || null;
    if (!Object.keys(data).length) return ok({ ok: true });
    await prisma.user.update({ where: { id: ctx.userId }, data });
    await recordAudit({ action: "PROFILE_UPDATED", actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "User", targetId: ctx.userId, metadata: { updated: Object.keys(data) } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
