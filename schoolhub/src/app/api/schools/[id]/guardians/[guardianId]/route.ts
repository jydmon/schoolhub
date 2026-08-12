import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, ROLES, LANGUAGES } from "@/lib/constants";
import { recordAudit } from "@/lib/audit";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string; guardianId: string } };

async function loadGuardian(schoolId: string, guardianId: string) {
  const p = await prisma.user.findFirst({
    where: { id: guardianId, memberships: { some: { schoolId, role: ROLES.PARENT } } },
    include: {
      guardianLinks: {
        where: { schoolId },
        include: { student: { select: { id: true, firstName: true, lastName: true, reference: true, yearGroup: true, photoUrl: true, class: { select: { name: true } } } } },
      },
    },
  });
  return p;
}

// Full parent/guardian profile with linked children.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const p = await loadGuardian(params.id, params.guardianId);
    if (!p) throw new AppError("Guardian not found", 404);
    return ok({
      guardian: {
        id: p.id, fullName: p.fullName, email: p.email, phone: p.phone, city: p.city,
        photoUrl: p.photoUrl, source: (p as any).source ?? "manual", status: p.status,
        preferredLanguage: p.preferredLanguage, preferredLanguageLabel: LANGUAGES[p.preferredLanguage] ?? p.preferredLanguage,
        onPlatform: p.status === "active" && !!p.passwordHash,
        children: p.guardianLinks.map((g) => ({
          linkId: g.id, student: g.student, relationship: g.relationship,
          isPrimaryContact: g.isPrimaryContact, isEmergencyContact: g.isEmergencyContact,
          collectionAuthorised: g.collectionAuthorised, custodyArrangement: g.custodyArrangement,
        })),
      },
    });
  } catch (err) { return handleError(err); }
}

// Edit a parent/guardian's contact details (manual/imported only; API is read-only).
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const p = await loadGuardian(params.id, params.guardianId);
    if (!p) throw new AppError("Guardian not found", 404);
    if (((p as any).source ?? "manual") === "api") throw new AppError("This guardian is fed from an integration and is read-only.", 403);

    const b = await req.json().catch(() => ({}));
    const data: any = {};
    if (typeof b.fullName === "string" && b.fullName.trim()) data.fullName = b.fullName.trim();
    if (typeof b.phone === "string") data.phone = b.phone.trim() || null;
    if (typeof b.city === "string") data.city = b.city.trim() || null;
    if (typeof b.preferredLanguage === "string") data.preferredLanguage = b.preferredLanguage.trim() || "en";
    if (typeof b.photoUrl === "string") data.photoUrl = b.photoUrl.trim() || null;
    if (!Object.keys(data).length) return ok({ ok: true });

    await prisma.user.update({ where: { id: p.id }, data });
    await recordAudit({ action: "GUARDIAN_UPDATED", schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "User", targetId: p.id, metadata: { updated: Object.keys(data) } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
