import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { listAttendance, attendanceSummary, upsertAttendance, updateAttendance, deleteAttendance } from "@/lib/attendance";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string } };

// GET ?date=YYYY-MM-DD → marks for that day + a summary.
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_DASHBOARDS, params.id);
    const date = new URL(req.url).searchParams.get("date") || undefined;
    const [records, summary] = await Promise.all([listAttendance(params.id, { date }), attendanceSummary(params.id, date)]);
    return ok({ records, summary });
  } catch (err) { return handleError(err); }
}

// POST: mark/update a pupil's attendance for a date+session (manual).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const b = await req.json().catch(() => ({}));
    if (!b.studentId || !b.date || !b.status) throw new AppError("studentId, date and status are required", 400);
    const res = await upsertAttendance(params.id, { studentId: String(b.studentId), date: String(b.date), session: b.session, status: String(b.status), note: b.note, actorUserId: ctx.userId });
    return ok(res, 201);
  } catch (err) { return handleError(err); }
}

// PATCH: edit a manual/imported record; DELETE ?id=. API records are read-only.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const b = await req.json().catch(() => ({}));
    if (!b.id) throw new AppError("id required", 400);
    await updateAttendance(params.id, String(b.id), { status: b.status, note: b.note }, ctx.userId);
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new AppError("id required", 400);
    await deleteAttendance(params.id, id);
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
