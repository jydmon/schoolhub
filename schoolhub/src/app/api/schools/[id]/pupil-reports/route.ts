import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan, can, PermissionError } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { reportReleaseCreateSchema } from "@/lib/validation";
import { createRelease } from "@/lib/reports-release";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Anyone who can author OR release may view the report worklist.
function assertCanSeeReports(ctx: any, schoolId: string) {
  if (!can(ctx, PERMISSIONS.AUTHOR_REPORTS, schoolId) && !can(ctx, PERMISSIONS.RELEASE_REPORTS, schoolId)) {
    throw new PermissionError("Missing permission: author_reports or release_reports");
  }
}

// GET → all report releases for the school with per-status report counts.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCanSeeReports(ctx, params.id);

    const releases = await prisma.reportRelease.findMany({
      where: { schoolId: params.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { createdBy: { select: { fullName: true } }, approvedBy: { select: { fullName: true } } },
    });

    const withCounts = await Promise.all(
      releases.map(async (r) => {
        const grouped = await prisma.studentReport.groupBy({ by: ["status"], where: { releaseId: r.id }, _count: { _all: true } });
        const counts: Record<string, number> = {};
        grouped.forEach((g) => { counts[g.status] = g._count._all; });
        const total = grouped.reduce((s, g) => s + g._count._all, 0);
        const viewed = await prisma.studentReport.count({ where: { releaseId: r.id, firstViewedAt: { not: null } } });
        return {
          id: r.id,
          name: r.name,
          type: r.type,
          term: r.term,
          status: r.status,
          releaseAt: r.releaseAt,
          releasedAt: r.releasedAt,
          notifyChannels: r.notifyChannels,
          createdBy: r.createdBy?.fullName ?? null,
          approvedBy: r.approvedBy?.fullName ?? null,
          approvedAt: r.approvedAt,
          createdAt: r.createdAt,
          reportCount: total,
          counts,
          viewed,
        };
      })
    );
    // Standalone reports not attached to any release (e.g. bulk-imported or
    // API-fed individual pupil reports). These previously never surfaced in the
    // UI, so an import "did nothing" from the admin's point of view.
    const standalone = await prisma.studentReport.findMany({
      where: { schoolId: params.id, releaseId: null },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { student: { select: { firstName: true, lastName: true, reference: true } } },
    });
    const standaloneReports = standalone.map((r) => ({
      id: r.id,
      studentName: `${r.student?.firstName ?? ""} ${r.student?.lastName ?? ""}`.trim() || r.studentId,
      studentRef: r.student?.reference ?? null,
      type: r.type, title: r.title, term: r.term, summary: r.summary,
      status: r.status, source: (r as any).source ?? "manual",
      editable: ((r as any).source ?? "manual") !== "api",
      createdAt: r.createdAt,
    }));

    return ok({ releases: withCounts, standaloneReports });
  } catch (err) { return handleError(err); }
}

// POST → create a release (optionally seeding reports). Authors only.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.AUTHOR_REPORTS, params.id);

    const i = reportReleaseCreateSchema.parse(await req.json());
    const { release, seeded } = await createRelease({
      schoolId: params.id,
      name: i.name,
      type: i.type,
      term: i.term,
      notifyChannels: i.notifyChannels,
      reports: i.reports,
      actor: { userId: ctx.userId, email: ctx.email },
    });
    return ok({ release, seeded }, 201);
  } catch (err) { return handleError(err); }
}
