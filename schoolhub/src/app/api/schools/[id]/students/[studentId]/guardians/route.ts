import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT, ROLES } from "@/lib/constants";
import { guardianLinkSchema, guardianLinkUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; studentId: string } };

async function ensureStudent(schoolId: string, studentId: string) {
  return prisma.student.findFirst({ where: { id: studentId, schoolId } });
}

// Link a guardian to a student (creating the guardian user if new).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const student = await ensureStudent(params.id, params.studentId);
    if (!student) return ok({ error: "Student not found" }, 404);

    const input = guardianLinkSchema.parse(await req.json());
    const email = input.email.toLowerCase();

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          fullName: input.fullName,
          phone: input.phone || null,
          preferredLanguage: input.preferredLanguage || "en",
          status: "invited",
        },
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          fullName: input.fullName,
          phone: input.phone ?? user.phone,
          preferredLanguage: input.preferredLanguage ?? user.preferredLanguage,
        },
      });
    }

    await prisma.membership.upsert({
      where: { userId_schoolId_role: { userId: user.id, schoolId: params.id, role: ROLES.PARENT } },
      update: {},
      create: { userId: user.id, schoolId: params.id, role: ROLES.PARENT },
    });

    const link = await prisma.guardianLink.upsert({
      where: { parentUserId_studentId: { parentUserId: user.id, studentId: student.id } },
      update: {
        relationship: input.relationship || "Parent",
        isPrimaryContact: !!input.isPrimaryContact,
        isEmergencyContact: !!input.isEmergencyContact,
        collectionAuthorised: !!input.collectionAuthorised,
        hasParentalResponsibility: input.hasParentalResponsibility ?? true,
        custodyArrangement: input.custodyArrangement || null,
        notificationPrefs: JSON.stringify(input.notificationPrefs ?? { email: true, sms: false, push: true }),
        infoRestrictions: JSON.stringify(input.infoRestrictions ?? []),
      },
      create: {
        schoolId: params.id,
        parentUserId: user.id,
        studentId: student.id,
        relationship: input.relationship || "Parent",
        isPrimaryContact: !!input.isPrimaryContact,
        isEmergencyContact: !!input.isEmergencyContact,
        collectionAuthorised: !!input.collectionAuthorised,
        hasParentalResponsibility: input.hasParentalResponsibility ?? true,
        custodyArrangement: input.custodyArrangement || null,
        notificationPrefs: JSON.stringify(input.notificationPrefs ?? { email: true, sms: false, push: true }),
        infoRestrictions: JSON.stringify(input.infoRestrictions ?? []),
      },
    });

    await recordAudit({
      action: AUDIT.GUARDIAN_LINKED,
      schoolId: params.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "GuardianLink",
      targetId: link.id,
      metadata: { studentId: student.id, guardianEmail: email },
    });

    return ok({ link }, 201);
  } catch (err) {
    return handleError(err);
  }
}

// Update a guardian link's per-guardian settings (?linkId=...).
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const linkId = new URL(req.url).searchParams.get("linkId");
    if (!linkId) return ok({ error: "linkId required" }, 400);
    const existing = await prisma.guardianLink.findFirst({
      where: { id: linkId, schoolId: params.id, studentId: params.studentId },
    });
    if (!existing) return ok({ error: "Link not found" }, 404);

    const input = guardianLinkUpdateSchema.parse(await req.json());
    const data: Record<string, unknown> = {};
    for (const k of ["relationship", "custodyArrangement"] as const) {
      if (input[k] !== undefined) data[k] = input[k] || null;
    }
    for (const k of ["isPrimaryContact", "isEmergencyContact", "collectionAuthorised", "hasParentalResponsibility"] as const) {
      if (input[k] !== undefined) data[k] = !!input[k];
    }
    if (input.notificationPrefs !== undefined) data.notificationPrefs = JSON.stringify(input.notificationPrefs);
    if (input.infoRestrictions !== undefined) data.infoRestrictions = JSON.stringify(input.infoRestrictions);

    const link = await prisma.guardianLink.update({ where: { id: linkId }, data });
    await recordAudit({
      action: AUDIT.GUARDIAN_LINKED,
      schoolId: params.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "GuardianLink",
      targetId: linkId,
      metadata: { updated: Object.keys(data) },
    });
    return ok({ link });
  } catch (err) {
    return handleError(err);
  }
}

// Remove a guardian link (?linkId=...).
export async function DELETE(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const linkId = new URL(req.url).searchParams.get("linkId");
    if (!linkId) return ok({ error: "linkId required" }, 400);
    const existing = await prisma.guardianLink.findFirst({
      where: { id: linkId, schoolId: params.id, studentId: params.studentId },
    });
    if (!existing) return ok({ error: "Link not found" }, 404);
    await prisma.guardianLink.delete({ where: { id: linkId } });
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
