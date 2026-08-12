import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { studentUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, clientIp, ok } from "@/lib/http";

type Params = { params: { id: string; studentId: string } };

const toDate = (v?: string | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);

// Full student profile: indicators, class, campus, guardians, collectors,
// emergency contacts. Everything is scoped to the tenant.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const student = await prisma.student.findFirst({
      where: { id: params.studentId, schoolId: params.id },
      include: {
        class: true,
        campus: true,
        guardianLinks: {
          include: { parent: { select: { id: true, fullName: true, email: true, phone: true, preferredLanguage: true } } },
        },
        approvedCollectors: true,
        emergencyContacts: { orderBy: { priority: "asc" } },
      },
    });
    if (!student) return ok({ error: "Not found" }, 404);
    return ok({ student });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const input = studentUpdateSchema.parse(await req.json());
    const existing = await prisma.student.findFirst({
      where: { id: params.studentId, schoolId: params.id },
    });
    if (!existing) return ok({ error: "Not found" }, 404);
    // API-sourced records are read-only; only imported/manual records may be edited.
    if (((existing as any).source ?? "manual") === "api") return ok({ error: "This student is fed from an integration and is read-only." }, 403);

    let classId = existing.classId;
    if (input.className !== undefined) {
      if (input.className) {
        const cls = await prisma.schoolClass.upsert({
          where: { schoolId_name: { schoolId: params.id, name: input.className } },
          update: {},
          create: { schoolId: params.id, name: input.className, yearGroup: input.yearGroup || null },
        });
        classId = cls.id;
      } else {
        classId = null;
      }
    }

    const data: Record<string, unknown> = { classId };
    for (const k of ["firstName", "lastName", "preferredName", "yearGroup", "house", "status", "photoUrl", "campusId", "allergies"] as const) {
      if (input[k] !== undefined) data[k] = input[k] || null;
    }
    for (const k of ["medicalAlert", "sendIndicator", "transportEligible"] as const) {
      if (input[k] !== undefined) data[k] = !!input[k];
    }
    if (input.dateOfBirth !== undefined) data.dateOfBirth = toDate(input.dateOfBirth || null);
    if (input.admissionDate !== undefined) data.admissionDate = toDate(input.admissionDate || null);

    const student = await prisma.student.update({ where: { id: existing.id }, data });

    await recordAudit({
      action: AUDIT.STUDENT_UPDATED,
      schoolId: params.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "Student",
      targetId: student.id,
      ip: clientIp(req),
      metadata: { fields: Object.keys(data) },
    });

    return ok({ student });
  } catch (err) {
    return handleError(err);
  }
}
