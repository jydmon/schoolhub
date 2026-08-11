import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { homeworkSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CALENDAR, params.id);
    const homework = await prisma.homework.findMany({ where: { schoolId: params.id }, orderBy: { dueAt: "asc" }, take: 300 });
    return ok({ homework });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CALENDAR, params.id);
    const input = homeworkSchema.parse(await req.json());
    const due = new Date(input.dueAt);
    if (isNaN(due.getTime())) return ok({ error: "Invalid due date" }, 400);

    const homework = await prisma.homework.create({
      data: {
        schoolId: params.id, title: input.title, description: input.description || null, subject: input.subject || null,
        dueAt: due, classId: input.classId || null, yearGroup: input.yearGroup || null, createdById: ctx.userId,
      },
    });
    await recordAudit({ action: AUDIT.HOMEWORK_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Homework", targetId: homework.id, metadata: { title: homework.title } });
    return ok({ homework }, 201);
  } catch (err) {
    return handleError(err);
  }
}
