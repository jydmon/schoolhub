import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };
const FEE_STATUSES = ["none", "invoiced", "paid", "waived"];

// Transport cost register: every pupil with an assigned route, the termly fee
// for that route, and where each pupil stands on paying it.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);

    const profiles = await prisma.studentTransportProfile.findMany({
      where: { schoolId: params.id, routeId: { not: null } },
      include: {
        student: { select: { firstName: true, lastName: true, yearGroup: true } },
        route: { select: { name: true, termlyFee: true } },
      },
    });

    const rows = profiles.map((p) => ({
      studentId: p.studentId,
      name: `${p.student.firstName} ${p.student.lastName}`,
      yearGroup: p.student.yearGroup,
      routeName: p.route?.name || "—",
      fee: p.route?.termlyFee ?? 0,
      feeStatus: p.feeStatus || "none",
    })).sort((a, b) => a.name.localeCompare(b.name));

    const totals = {
      pupils: rows.length,
      expected: rows.reduce((s, r) => s + (r.feeStatus === "waived" ? 0 : r.fee), 0),
      collected: rows.filter((r) => r.feeStatus === "paid").reduce((s, r) => s + r.fee, 0),
      invoiced: rows.filter((r) => r.feeStatus === "invoiced").reduce((s, r) => s + r.fee, 0),
      outstanding: rows.filter((r) => r.feeStatus === "invoiced" || r.feeStatus === "none").reduce((s, r) => s + r.fee, 0),
    };
    return ok({ rows, totals });
  } catch (err) { return handleError(err); }
}

// Set a pupil's fee status (invoiced / paid / waived / none).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const body = await req.json().catch(() => ({}));
    const studentId = String(body.studentId || "");
    const feeStatus = String(body.feeStatus || "");
    if (!studentId || !FEE_STATUSES.includes(feeStatus)) return ok({ error: "studentId and a valid feeStatus are required" }, 400);

    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: params.id }, select: { id: true } });
    if (!student) return ok({ error: "Student not found" }, 404);

    await prisma.studentTransportProfile.upsert({
      where: { studentId }, update: { feeStatus }, create: { studentId, schoolId: params.id, feeStatus },
    });
    await recordAudit({ action: AUDIT.TRANSPORT_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "StudentTransportProfile", targetId: studentId, metadata: { op: "fee_status", feeStatus } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
