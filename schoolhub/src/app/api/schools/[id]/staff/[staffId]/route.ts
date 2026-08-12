import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, ROLE_LABELS } from "@/lib/constants";
import { recordAudit } from "@/lib/audit";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string; staffId: string } };
const STAFF_STATUSES = ["active", "inactive", "holiday", "onleave", "sick"];

// Full staff profile: roles, classes taught, pupils in those classes, status.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const s = await prisma.staffProfile.findFirst({
      where: { id: params.staffId, schoolId: params.id },
      include: {
        user: { include: { memberships: { where: { schoolId: params.id } } } },
        classes: { include: { class: { select: { id: true, name: true, yearGroup: true } } } },
      },
    });
    if (!s) throw new AppError("Staff member not found", 404);

    const classIds = s.classes.map((c) => c.class.id);
    const pupils = classIds.length
      ? await prisma.student.findMany({
          where: { schoolId: params.id, classId: { in: classIds } },
          select: { id: true, firstName: true, lastName: true, reference: true, class: { select: { name: true } } },
          orderBy: [{ lastName: "asc" }],
          take: 500,
        })
      : [];

    return ok({
      staff: {
        id: s.id, reference: s.reference, jobTitle: s.jobTitle, department: s.department,
        status: (s as any).status ?? "active", source: (s as any).source ?? "manual",
        activities: JSON.parse(s.activities || "[]"), trips: JSON.parse(s.trips || "[]"),
        user: { id: s.user.id, fullName: s.user.fullName, email: s.user.email, phone: s.user.phone, photoUrl: (s.user as any).photoUrl ?? null },
        roles: s.user.memberships.map((m) => ROLE_LABELS[m.role] ?? m.role),
        classes: s.classes.map((c) => ({ id: c.class.id, name: c.class.name, yearGroup: c.class.yearGroup })),
        pupils,
      },
    });
  } catch (err) { return handleError(err); }
}

// Edit staff (job title, department, status). API-sourced records are read-only.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const s = await prisma.staffProfile.findFirst({ where: { id: params.staffId, schoolId: params.id } });
    if (!s) throw new AppError("Staff member not found", 404);
    if (((s as any).source ?? "manual") === "api") throw new AppError("This staff record is fed from an integration and is read-only.", 403);

    const b = await req.json().catch(() => ({}));
    const data: any = {};
    if (typeof b.jobTitle === "string") data.jobTitle = b.jobTitle.trim() || null;
    if (typeof b.department === "string") data.department = b.department.trim() || null;
    if (typeof b.status === "string" && STAFF_STATUSES.includes(b.status)) data.status = b.status;
    if (!Object.keys(data).length) return ok({ ok: true });

    await prisma.staffProfile.update({ where: { id: s.id }, data });
    if (typeof b.photoUrl === "string") await prisma.user.update({ where: { id: s.userId }, data: { photoUrl: b.photoUrl.trim() || null } });
    await recordAudit({ action: "STAFF_UPDATED", schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "StaffProfile", targetId: s.id, metadata: { updated: Object.keys(data) } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
