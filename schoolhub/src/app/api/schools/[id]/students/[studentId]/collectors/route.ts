import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { collectorSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; studentId: string } };

// Add an approved collector for a student.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const student = await prisma.student.findFirst({
      where: { id: params.studentId, schoolId: params.id },
    });
    if (!student) return ok({ error: "Student not found" }, 404);

    const input = collectorSchema.parse(await req.json());
    const collector = await prisma.approvedCollector.create({
      data: {
        schoolId: params.id,
        studentId: student.id,
        name: input.name,
        relationship: input.relationship || null,
        phone: input.phone || null,
        photoUrl: input.photoUrl || null,
        linkedUserId: input.linkedUserId || null,
      },
    });
    await recordAudit({
      action: AUDIT.COLLECTOR_CHANGED,
      schoolId: params.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "ApprovedCollector",
      targetId: collector.id,
      metadata: { studentId: student.id, name: input.name, op: "add" },
    });
    return ok({ collector }, 201);
  } catch (err) {
    return handleError(err);
  }
}

// Remove an approved collector (?collectorId=...).
export async function DELETE(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const collectorId = new URL(req.url).searchParams.get("collectorId");
    if (!collectorId) return ok({ error: "collectorId required" }, 400);
    const existing = await prisma.approvedCollector.findFirst({
      where: { id: collectorId, schoolId: params.id, studentId: params.studentId },
    });
    if (!existing) return ok({ error: "Not found" }, 404);
    await prisma.approvedCollector.delete({ where: { id: collectorId } });
    await recordAudit({
      action: AUDIT.COLLECTOR_CHANGED,
      schoolId: params.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "ApprovedCollector",
      targetId: collectorId,
      metadata: { op: "remove" },
    });
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
