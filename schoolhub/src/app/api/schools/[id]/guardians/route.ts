import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, ROLES, LANGUAGES } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// List parents/guardians in a school with their linked children.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const parents = await prisma.user.findMany({
      where: { memberships: { some: { schoolId: params.id, role: ROLES.PARENT } } },
      include: {
        guardianLinks: {
          where: { schoolId: params.id },
          include: { student: { select: { id: true, firstName: true, lastName: true, reference: true } } },
        },
      },
      orderBy: { fullName: "asc" },
    });

    return ok({
      guardians: parents.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        email: p.email,
        phone: p.phone,
        city: p.city,
        photoUrl: p.photoUrl,
        source: (p as any).source ?? "manual",
        preferredLanguage: p.preferredLanguage,
        preferredLanguageLabel: LANGUAGES[p.preferredLanguage] ?? p.preferredLanguage,
        status: p.status,
        children: p.guardianLinks.map((g) => ({
          linkId: g.id,
          student: g.student,
          relationship: g.relationship,
          isPrimaryContact: g.isPrimaryContact,
          isEmergencyContact: g.isEmergencyContact,
          collectionAuthorised: g.collectionAuthorised,
          custodyArrangement: g.custodyArrangement,
          notificationPrefs: JSON.parse(g.notificationPrefs || "{}"),
          infoRestrictions: JSON.parse(g.infoRestrictions || "[]"),
        })),
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
