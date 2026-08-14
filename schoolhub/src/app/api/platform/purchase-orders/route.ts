import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { computePoCost, poReference } from "@/lib/commerce";
import { poCreateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok, AppError } from "@/lib/http";

// Purchase Orders — Account Managers and Super Admins (the "subscriptions" area).
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "subscriptions");
    const schoolId = new URL(req.url).searchParams.get("schoolId") || undefined;
    const orders = await prisma.purchaseOrder.findMany({ where: schoolId ? { schoolId } : {}, orderBy: { createdAt: "desc" }, take: 500 });
    return ok({ orders });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "subscriptions");
    const b = poCreateSchema.parse(await req.json());

    const plan = await prisma.plan.findUnique({ where: { key: b.planKey } });
    if (!plan) throw new AppError("Unknown plan", 400);

    const termYears = b.termYears ?? 1;
    const discountPct = b.discountPct ?? 0;
    const { discountAmount, finalCost } = computePoCost({ unitPrice: plan.pricePerSchool, termYears, discountPct });

    // System-generated reference PO-<year>-<seq>, retrying on the unique index.
    const year = new Date().getFullYear();
    const base = await prisma.purchaseOrder.count({ where: { createdAt: { gte: new Date(year, 0, 1) } } });
    let created = null as null | { id: string; reference: string };
    for (let i = 1; i <= 5 && !created; i++) {
      const reference = poReference(base + i, year);
      try {
        const po = await prisma.purchaseOrder.create({
          data: {
            reference, schoolId: b.schoolId ?? null, schoolName: b.schoolName,
            planId: plan.id, planKey: plan.key, planName: plan.name, packageType: plan.key,
            userQuantity: b.userQuantity ?? 0, termYears, unitPrice: plan.pricePerSchool,
            discountPct, discountAmount, finalCost, status: "draft", notes: b.notes ?? null,
            createdById: ctx.userId,
          },
        });
        created = { id: po.id, reference: po.reference };
      } catch { /* unique collision — try the next sequence number */ }
    }
    if (!created) throw new AppError("Could not allocate a PO reference, please retry.", 500);

    await recordAudit({ action: AUDIT.PO_CREATED, actorUserId: ctx.userId, actorEmail: ctx.email, schoolId: b.schoolId ?? undefined, targetType: "PurchaseOrder", targetId: created.id, metadata: { reference: created.reference, planKey: plan.key, termYears, finalCost } });
    if (discountPct > 0) await recordAudit({ action: AUDIT.DISCOUNT_APPLIED, actorUserId: ctx.userId, actorEmail: ctx.email, schoolId: b.schoolId ?? undefined, targetType: "PurchaseOrder", targetId: created.id, metadata: { discountPct, discountAmount } });

    return ok({ id: created.id, reference: created.reference }, 201);
  } catch (err) { return handleError(err); }
}
