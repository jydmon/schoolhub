import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan, rolesInSchool } from "@/lib/rbac";
import { isAuthorisedForSensitive, redactStudent } from "@/lib/safeguarding";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { studentCreateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, clientIp, ok } from "@/lib/http";

type Params = { params: { id: string } };

const toDate = (v?: string | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);

export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const q = new URL(req.url).searchParams.get("q")?.trim();
    const students = await prisma.student.findMany({
      where: {
        schoolId: params.id,
        ...(q
          ? {
              OR: [
                { firstName: { contains: q } },
                { lastName: { contains: q } },
                { reference: { contains: q } },
              ],
            }
          : {}),
      },
      include: {
        class: { select: { name: true } },
        campus: { select: { name: true } },
        _count: { select: { guardianLinks: true, approvedCollectors: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
    });
    // Safeguarding: redact medical/SEND/location for non-senior staff when the
    // school has those restrictions enabled.
    const authorised = isAuthorisedForSensitive(rolesInSchool(ctx, params.id)) || ctx.isPlatformAdmin;
    const config = await prisma.schoolConfig.findUnique({ where: { schoolId: params.id } });
    return ok({ students: students.map((s) => redactStudent(s, { authorised, config })) });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const input = studentCreateSchema.parse(await req.json());

    const dup = await prisma.student.findUnique({
      where: { schoolId_reference: { schoolId: params.id, reference: input.reference } },
    });
    if (dup) return ok({ error: `Student reference "${input.reference}" already exists` }, 409);

    let classId: string | null = null;
    if (input.className) {
      const cls = await prisma.schoolClass.upsert({
        where: { schoolId_name: { schoolId: params.id, name: input.className } },
        update: {},
        create: { schoolId: params.id, name: input.className, yearGroup: input.yearGroup || null },
      });
      classId = cls.id;
    }

    const student = await prisma.student.create({
      data: {
        schoolId: params.id,
        reference: input.reference,
        firstName: input.firstName,
        lastName: input.lastName,
        preferredName: input.preferredName || null,
        dateOfBirth: toDate(input.dateOfBirth || null),
        photoUrl: input.photoUrl || null,
        campusId: input.campusId || null,
        yearGroup: input.yearGroup || null,
        classId,
        house: input.house || null,
        status: input.status || "enrolled",
        admissionDate: toDate(input.admissionDate || null),
        medicalAlert: !!input.medicalAlert,
        sendIndicator: !!input.sendIndicator,
        transportEligible: !!input.transportEligible,
      },
    });

    await recordAudit({
      action: AUDIT.STUDENT_CREATED,
      schoolId: params.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "Student",
      targetId: student.id,
      ip: clientIp(req),
      metadata: { reference: student.reference },
    });

    return ok({ student }, 201);
  } catch (err) {
    return handleError(err);
  }
}
