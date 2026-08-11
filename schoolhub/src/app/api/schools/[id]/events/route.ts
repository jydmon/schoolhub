import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { eventCreateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

const parseDate = (v: string, field: string) => {
  const d = new Date(v);
  if (isNaN(d.getTime())) throw new Error(`${field} is not a valid date/time`);
  return d;
};

// List events (optionally within a date window / category).
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CALENDAR, params.id);

    const sp = new URL(req.url).searchParams;
    const from = sp.get("from") ? new Date(sp.get("from")!) : undefined;
    const to = sp.get("to") ? new Date(sp.get("to")!) : undefined;
    const category = sp.get("category") || undefined;

    const events = await prisma.calendarEvent.findMany({
      where: {
        schoolId: params.id,
        ...(category ? { category } : {}),
        ...(from || to ? { startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      include: { _count: { select: { students: true, staff: true } } },
      orderBy: { startsAt: "asc" },
      take: 500,
    });
    return ok({ events });
  } catch (err) {
    return handleError(err);
  }
}

// Create an event.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CALENDAR, params.id);

    const input = eventCreateSchema.parse(await req.json());

    // Restrict explicit participant ids to this tenant.
    let studentIds: string[] = [];
    if (input.studentIds?.length) {
      const rows = await prisma.student.findMany({ where: { schoolId: params.id, id: { in: input.studentIds } }, select: { id: true } });
      studentIds = rows.map((r) => r.id);
    }
    let staffIds: string[] = [];
    if (input.staffIds?.length) {
      const rows = await prisma.membership.findMany({ where: { schoolId: params.id, userId: { in: input.staffIds } }, select: { userId: true } });
      staffIds = Array.from(new Set(rows.map((r) => r.userId)));
    }

    const event = await prisma.calendarEvent.create({
      data: {
        schoolId: params.id,
        title: input.title,
        description: input.description || null,
        category: input.category || "event",
        startsAt: parseDate(input.startsAt, "startsAt"),
        endsAt: input.endsAt ? parseDate(input.endsAt, "endsAt") : null,
        allDay: !!input.allDay,
        location: input.location || null,
        audienceScope: input.audienceScope || "school",
        campusId: input.campusId || null,
        yearGroup: input.yearGroup || null,
        classId: input.classId || null,
        house: input.house || null,
        club: input.club || null,
        equipment: input.equipment || null,
        clothing: input.clothing || null,
        packedLunch: !!input.packedLunch,
        transportRequired: !!input.transportRequired,
        collectionAt: input.collectionAt ? parseDate(input.collectionAt, "collectionAt") : null,
        collectionLocation: input.collectionLocation || null,
        attachments: JSON.stringify(input.attachments ?? []),
        reminderOffsets: JSON.stringify(input.reminderOffsets ?? []),
        consentRequired: !!input.consentRequired,
        paymentRef: input.paymentRef || null,
        status: input.status || "published",
        createdById: ctx.userId,
        students: studentIds.length ? { create: studentIds.map((studentId) => ({ studentId })) } : undefined,
        staff: staffIds.length ? { create: staffIds.map((userId) => ({ userId })) } : undefined,
      },
    });

    await recordAudit({
      action: AUDIT.EVENT_CHANGED,
      schoolId: params.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "CalendarEvent",
      targetId: event.id,
      metadata: { title: event.title, category: event.category, op: "create" },
    });

    return ok({ event }, 201);
  } catch (err) {
    return handleError(err);
  }
}
