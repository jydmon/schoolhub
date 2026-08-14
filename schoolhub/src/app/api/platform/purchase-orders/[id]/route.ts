import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { computePoCost, canEditPo, canCancelPo, canSendPo, formatMoney } from "@/lib/commerce";
import { poUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT, ROLES } from "@/lib/constants";
import { sendEmail } from "@/lib/email";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "subscriptions");
    const po = await prisma.purchaseOrder.findUnique({ where: { id: params.id } });
    if (!po) throw new AppError("Purchase Order not found", 404);
    return ok({ order: po });
  } catch (err) { return handleError(err); }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "subscriptions");
    const b = poUpdateSchema.parse(await req.json());
    const po = await prisma.purchaseOrder.findUnique({ where: { id: params.id } });
    if (!po) throw new AppError("Purchase Order not found", 404);

    // ---- Actions ----
    if (b.action === "cancel") {
      if (!canCancelPo(po.status)) throw new AppError("This PO can't be cancelled.", 400);
      await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: "cancelled" } });
      await recordAudit({ action: AUDIT.PO_CANCELLED, actorUserId: ctx.userId, actorEmail: ctx.email, schoolId: po.schoolId ?? undefined, targetType: "PurchaseOrder", targetId: po.id, metadata: { reference: po.reference } });
      return ok({ ok: true });
    }
    if (b.action === "send" || b.action === "resend") {
      if (!canSendPo(po.status)) throw new AppError("This PO can't be sent.", 400);
      await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: "sent", sentAt: new Date() } });
      // Best-effort email to the tenant's administrator / contact.
      try {
        const to = await tenantEmail(po.schoolId);
        if (to) await sendEmail({ to, subject: `Purchase Order ${po.reference} — ${po.schoolName}`, body: poEmailBody(po) });
      } catch { /* email provider optional */ }
      await recordAudit({ action: b.action === "resend" ? AUDIT.PO_RESENT : AUDIT.PO_SENT, actorUserId: ctx.userId, actorEmail: ctx.email, schoolId: po.schoolId ?? undefined, targetType: "PurchaseOrder", targetId: po.id, metadata: { reference: po.reference } });
      return ok({ ok: true });
    }

    // ---- Edit ----
    if (!canEditPo(po.status)) throw new AppError("This PO can no longer be edited.", 400);
    let unitPrice = po.unitPrice, planId = po.planId, planKey = po.planKey, planName = po.planName, packageType = po.packageType;
    if (b.planKey && b.planKey !== po.planKey) {
      const plan = await prisma.plan.findUnique({ where: { key: b.planKey } });
      if (!plan) throw new AppError("Unknown plan", 400);
      unitPrice = plan.pricePerSchool; planId = plan.id; planKey = plan.key; planName = plan.name; packageType = plan.key;
    }
    const termYears = b.termYears ?? po.termYears;
    const discountPct = b.discountPct ?? po.discountPct;
    const { discountAmount, finalCost } = computePoCost({ unitPrice, termYears, discountPct });
    const discountChanged = discountPct !== po.discountPct;

    await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: {
        schoolName: b.schoolName ?? po.schoolName, planId, planKey, planName, packageType,
        userQuantity: b.userQuantity ?? po.userQuantity, termYears, unitPrice,
        discountPct, discountAmount, finalCost, notes: b.notes ?? po.notes,
      },
    });
    await recordAudit({ action: AUDIT.PO_UPDATED, actorUserId: ctx.userId, actorEmail: ctx.email, schoolId: po.schoolId ?? undefined, targetType: "PurchaseOrder", targetId: po.id, metadata: { reference: po.reference, termYears, finalCost } });
    if (discountChanged) await recordAudit({ action: AUDIT.DISCOUNT_APPLIED, actorUserId: ctx.userId, actorEmail: ctx.email, schoolId: po.schoolId ?? undefined, targetType: "PurchaseOrder", targetId: po.id, metadata: { discountPct, discountAmount } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}

async function tenantEmail(schoolId: string | null): Promise<string | null> {
  if (!schoolId) return null;
  const admin = await prisma.membership.findFirst({ where: { schoolId, role: ROLES.SCHOOL_ADMIN }, include: { user: { select: { email: true } } } });
  if (admin?.user?.email) return admin.user.email;
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { contactEmail: true } });
  return school?.contactEmail ?? null;
}

function poEmailBody(po: { reference: string; schoolName: string; planName: string; termYears: number; finalCost: number; currency: string }): string {
  return `Hello,\n\nPlease find your Purchase Order ${po.reference} for ${po.schoolName}.\n\nPlan: ${po.planName}\nTerm: ${po.termYears} year(s)\nTotal: ${formatMoney(po.finalCost, po.currency)}\n\nTo proceed, sign in to SIPlat, accept the Terms of Business, complete your school profile, and upload your invoice or proof of payment. Your account will be activated once payment is reviewed.\n\nThank you,\nThe SIPlat team`;
}
