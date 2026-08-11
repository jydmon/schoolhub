import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { emergencyContactSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; studentId: string } };

// Add a (non-user) emergency contact for a student.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const student = await prisma.student.findFirst({
      where: { id: params.studentId, schoolId: params.id },
    });
    if (!student) return ok({ error: "Student not found" }, 404);

    const input = emergencyContactSchema.parse(await req.json());
    const contact = await prisma.emergencyContact.create({
      data: {
        schoolId: params.id,
        studentId: student.id,
        name: input.name,
        relationship: input.relationship || null,
        phone: input.phone || null,
        email: input.email || null,
        priority: input.priority ?? 1,
      },
    });
    return ok({ contact }, 201);
  } catch (err) {
    return handleError(err);
  }
}

// Remove an emergency contact (?contactId=...).
export async function DELETE(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const contactId = new URL(req.url).searchParams.get("contactId");
    if (!contactId) return ok({ error: "contactId required" }, 400);
    const existing = await prisma.emergencyContact.findFirst({
      where: { id: contactId, schoolId: params.id, studentId: params.studentId },
    });
    if (!existing) return ok({ error: "Not found" }, 404);
    await prisma.emergencyContact.delete({ where: { id: contactId } });
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
