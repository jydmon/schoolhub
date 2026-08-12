import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { eventUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; eventId: string } };

const parseDate = (v: string) => { const d = new Date(v); if (isNaN(d.getTime())) throw new Error("Invalid date"); return d; };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CALENDAR, params.id);
    const event = await prisma.calendarEvent.findFirst({
      where: { id: params.eventId, schoolId: params.id },
      include: {
        students: { include: { student: { select: { id: true, firstName: true, lastName: true } } } },
        staff: { include: { user: { select: { id: true, fullName: true } } } },
      },
    });
    if (!event) return ok({ error: "Not found" }, 404);
    return ok({ event: { ...event, attachments: JSON.parse(event.attachments || "[]"), reminderOffsets: JSON.parse(event.reminderOffsets || "[]") } });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CALENDAR, params.id);

    const existing = await prisma.calendarEvent.findFirst({ where: { id: params.eventId, schoolId: params.id } });
    if (!existing) return ok({ error: "Not found" }, 404);
    if (existing.source === "api") return ok({ error: "This event is fed by an integration and is read-only here. Edit it in the source system." }, 409);

    const input = eventUpdateSchema.parse(await req.json());
    const data: Record<string, unknown> = {};
    for (const k of ["title", "description", "category", "location", "audienceScope", "campusId", "yearGroup", "classId", "house", "club", "equipment", "clothing", "collectionLocation", "paymentRef", "status"] as const) {
      if (input[k] !== undefined) data[k] = input[k] || null;
    }
    for (const k of ["allDay", "packedLunch", "transportRequired", "consentRequired"] as const) {
      if (input[k] !== undefined) data[k] = !!input[k];
    }
    if (input.startsAt !== undefined) data.startsAt = parseDate(input.startsAt);
    if (input.endsAt !== undefined) data.endsAt = input.endsAt ? parseDate(input.endsAt) : null;
    if (input.collectionAt !== undefined) data.collectionAt = input.collectionAt ? parseDate(input.collectionAt) : null;
    if (input.attachments !== undefined) data.attachments = JSON.stringify(input.attachments);
    if (input.reminderOffsets !== undefined) data.reminderOffsets = JSON.stringify(input.reminderOffsets);

    const event = await prisma.calendarEvent.update({ where: { id: existing.id }, data });
    await recordAudit({
      action: AUDIT.EVENT_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email,
      targetType: "CalendarEvent", targetId: event.id, metadata: { op: "update", fields: Object.keys(data) },
    });
    return ok({ event });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CALENDAR, params.id);
    const existing = await prisma.calendarEvent.findFirst({ where: { id: params.eventId, schoolId: params.id } });
    if (!existing) return ok({ error: "Not found" }, 404);
    if (existing.source === "api") return ok({ error: "This event is fed by an integration and is read-only here." }, 409);
    await prisma.calendarEvent.delete({ where: { id: existing.id } });
    await recordAudit({ action: AUDIT.EVENT_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "CalendarEvent", targetId: existing.id, metadata: { op: "delete" } });
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
