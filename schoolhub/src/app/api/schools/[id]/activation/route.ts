import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { assertTenantAccess } from "@/lib/tenant";
import { activateSchool, activationHistory } from "@/lib/activation";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string } };

// Activation & payment review for a tenant. Restricted to platform staff with
// the "tenants" area (Account Managers, Super Admins); AMs are further limited
// to their geographic portfolio via assertTenantAccess.
async function gate(ctx: any, schoolId: string) {
  await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "tenants");
  assertTenantAccess(ctx, schoolId); // AM portfolio / owner / member
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await gate(ctx, params.id);
    const [school, payments, history] = await Promise.all([
      prisma.school.findUnique({ where: { id: params.id }, select: { id: true, name: true, activationStatus: true, activatedAt: true, activatedByUserId: true } }),
      prisma.paymentSubmission.findMany({ where: { schoolId: params.id }, orderBy: { createdAt: "desc" } }),
      activationHistory(params.id),
    ]);
    if (!school) throw new AppError("School not found", 404);
    return ok({ school, payments, history });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await gate(ctx, params.id);
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || "");

    if (action === "approve_payment") {
      const pay = await prisma.paymentSubmission.findFirst({ where: { id: String(b.paymentId || ""), schoolId: params.id } });
      if (!pay) throw new AppError("Payment submission not found", 404);
      await prisma.paymentSubmission.update({ where: { id: pay.id }, data: { status: "approved", reviewedById: ctx.userId, reviewedAt: new Date(), reviewNote: b.note ? String(b.note) : null } });
      await recordAudit({ action: AUDIT.PAYMENT_APPROVED, actorUserId: ctx.userId, actorEmail: ctx.email, schoolId: params.id, targetType: "PaymentSubmission", targetId: pay.id });
      await activateSchool({ schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, method: "invoice", type: "payment_approved" });
      return ok({ ok: true });
    }
    if (action === "reject_payment") {
      const pay = await prisma.paymentSubmission.findFirst({ where: { id: String(b.paymentId || ""), schoolId: params.id } });
      if (!pay) throw new AppError("Payment submission not found", 404);
      await prisma.paymentSubmission.update({ where: { id: pay.id }, data: { status: "rejected", reviewedById: ctx.userId, reviewedAt: new Date(), reviewNote: b.note ? String(b.note) : null } });
      await recordAudit({ action: AUDIT.PAYMENT_REJECTED, actorUserId: ctx.userId, actorEmail: ctx.email, schoolId: params.id, targetType: "PaymentSubmission", targetId: pay.id, metadata: { note: b.note ?? undefined } });
      return ok({ ok: true });
    }
    if (action === "manual_activate") {
      const justification = String(b.justification || "").trim();
      if (justification.length < 5) throw new AppError("A business justification is required to activate without proof of payment.", 400);
      const school = await prisma.school.findUnique({ where: { id: params.id }, select: { activationStatus: true } });
      if ((school?.activationStatus ?? "activated") === "activated") throw new AppError("This account is already activated.", 400);
      await activateSchool({ schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, method: "manual", type: "manual", justification });
      return ok({ ok: true });
    }
    throw new AppError("Unknown action", 400);
  } catch (err) { return handleError(err); }
}
