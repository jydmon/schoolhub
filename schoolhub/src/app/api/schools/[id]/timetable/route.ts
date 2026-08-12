import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { timetableSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// List timetable lessons for the school, with teacher names resolved. Optional
// filters: ?teacher=<userId>, ?year=<yearGroup>, ?class=<className>.
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CALENDAR, params.id);
    const sp = new URL(req.url).searchParams;
    const where: any = { schoolId: params.id };
    if (sp.get("teacher")) where.teacherUserId = sp.get("teacher");
    if (sp.get("year")) where.yearGroup = sp.get("year");
    if (sp.get("class")) where.className = sp.get("class");

    const entries = await prisma.timetableEntry.findMany({ where, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] });
    const teacherIds = Array.from(new Set(entries.map((e) => e.teacherUserId).filter(Boolean))) as string[];
    const teachers = teacherIds.length ? await prisma.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, fullName: true } }) : [];
    const nameById = new Map(teachers.map((t) => [t.id, t.fullName]));
    return ok({ entries: entries.map((e) => ({ ...e, teacherName: e.teacherUserId ? (nameById.get(e.teacherUserId) || null) : null })) });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CALENDAR, params.id);
    const i = timetableSchema.parse(await req.json());
    const entry = await prisma.timetableEntry.create({
      data: {
        schoolId: params.id, dayOfWeek: i.dayOfWeek, period: i.period || null,
        startTime: i.startTime, endTime: i.endTime, subject: i.subject,
        yearGroup: i.yearGroup || null, className: i.className || null, room: i.room || null,
        teacherUserId: i.teacherUserId || null,
      },
    });
    await recordAudit({ action: AUDIT.EVENT_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "TimetableEntry", targetId: entry.id, metadata: { op: "create", subject: entry.subject } });
    return ok({ entry }, 201);
  } catch (err) { return handleError(err); }
}
