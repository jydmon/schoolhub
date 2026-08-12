import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { timetableUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; entryId: string } };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CALENDAR, params.id);
    const existing = await prisma.timetableEntry.findFirst({ where: { id: params.entryId, schoolId: params.id } });
    if (!existing) return ok({ error: "Not found" }, 404);
    if (existing.source === "api") return ok({ error: "This lesson is fed by an integration and is read-only here." }, 409);
    const i = timetableUpdateSchema.parse(await req.json());
    const data: Record<string, unknown> = {};
    for (const k of ["period", "startTime", "endTime", "subject", "yearGroup", "className", "room", "teacherUserId"] as const) {
      if (i[k] !== undefined) data[k] = (i as any)[k] || null;
    }
    if (i.dayOfWeek !== undefined) data.dayOfWeek = i.dayOfWeek;
    const entry = await prisma.timetableEntry.update({ where: { id: existing.id }, data });
    await recordAudit({ action: AUDIT.EVENT_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "TimetableEntry", targetId: entry.id, metadata: { op: "update" } });
    return ok({ entry });
  } catch (err) { return handleError(err); }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CALENDAR, params.id);
    const existing = await prisma.timetableEntry.findFirst({ where: { id: params.entryId, schoolId: params.id } });
    if (!existing) return ok({ error: "Not found" }, 404);
    if (existing.source === "api") return ok({ error: "This lesson is fed by an integration and is read-only here." }, 409);
    await prisma.timetableEntry.delete({ where: { id: existing.id } });
    await recordAudit({ action: AUDIT.EVENT_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "TimetableEntry", targetId: existing.id, metadata: { op: "delete" } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
