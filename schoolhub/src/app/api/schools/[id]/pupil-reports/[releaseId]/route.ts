import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan, can, PermissionError } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { reportAddSchema, reportTransitionSchema } from "@/lib/validation";
import { getReleaseDetail, addReports, transitionRelease } from "@/lib/reports-release";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; releaseId: string } };

function assertCanSeeReports(ctx: any, schoolId: string) {
  if (!can(ctx, PERMISSIONS.AUTHOR_REPORTS, schoolId) && !can(ctx, PERMISSIONS.RELEASE_REPORTS, schoolId)) {
    throw new PermissionError("Missing permission: author_reports or release_reports");
  }
}

// GET → full release with its per-pupil reports.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCanSeeReports(ctx, params.id);
    const release = await getReleaseDetail(params.id, params.releaseId);
    return ok({ release });
  } catch (err) { return handleError(err); }
}

// POST → add pupil reports to a release (authors only).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.AUTHOR_REPORTS, params.id);

    const i = reportAddSchema.parse(await req.json());
    const release = await getReleaseDetail(params.id, params.releaseId);
    const result = await addReports({
      schoolId: params.id,
      releaseId: release.id,
      releaseType: release.type,
      releaseTerm: release.term,
      authorId: ctx.userId,
      items: i.reports,
    });
    return ok(result, 201);
  } catch (err) { return handleError(err); }
}

// PATCH → lifecycle transition. `submit` is an author action; approve/schedule/
// release_now/withdraw require release permission.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    const i = reportTransitionSchema.parse(await req.json());

    if (i.action === "submit") assertCan(ctx, PERMISSIONS.AUTHOR_REPORTS, params.id);
    else assertCan(ctx, PERMISSIONS.RELEASE_REPORTS, params.id);

    const result = await transitionRelease({
      schoolId: params.id,
      releaseId: params.releaseId,
      action: i.action,
      releaseAt: i.releaseAt,
      notifyChannels: i.notifyChannels,
      actor: { userId: ctx.userId, email: ctx.email },
    });
    return ok(result);
  } catch (err) { return handleError(err); }
}
