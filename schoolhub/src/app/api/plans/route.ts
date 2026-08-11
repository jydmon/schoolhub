import { prisma } from "@/lib/db";
import { requireAuth, requirePlatformAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";
import { z } from "zod";

// List subscription plans (any authenticated user may read the catalogue).
export async function GET() {
  try {
    await requireAuth();
    const plans = await prisma.plan.findMany({ orderBy: { pricePerSchool: "asc" } });
    return ok({ plans });
  } catch (err) {
    return handleError(err);
  }
}

const planSchema = z.object({
  key: z.string().min(2).max(40).regex(/^[a-z0-9_]+$/, "lowercase letters, numbers and underscores only"),
  name: z.string().min(2).max(80),
  pricePerSchool: z.number().int().min(0).max(100000000).optional(),
  pricePerStudent: z.number().int().min(0).max(100000000).optional(),
  pricePerVehicle: z.number().int().min(0).max(100000000).optional(),
  aiQueryLimit: z.number().int().min(-1).max(10000000).optional(),
  features: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
});

// Create or update a subscription package (platform super-admin only). Upserts by key.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    if (!ctx.isPlatformAdmin) await requirePlatformAdmin();
    const b = planSchema.parse(await req.json());
    const data = {
      name: b.name,
      pricePerSchool: b.pricePerSchool ?? 0,
      pricePerStudent: b.pricePerStudent ?? 0,
      pricePerVehicle: b.pricePerVehicle ?? 0,
      aiQueryLimit: b.aiQueryLimit ?? 0,
      features: b.features ?? "",
      isActive: b.isActive ?? true,
    };
    const plan = await prisma.plan.upsert({ where: { key: b.key }, update: data, create: { key: b.key, ...data } });
    await recordAudit({ action: "plan.upserted", actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Plan", targetId: plan.id, metadata: { key: b.key } });
    return ok({ plan }, 201);
  } catch (err) {
    return handleError(err);
  }
}

// Toggle a plan active/inactive (?key=...). Platform super-admin only.
export async function PATCH(req: Request) {
  try {
    const ctx = await requireAuth();
    if (!ctx.isPlatformAdmin) await requirePlatformAdmin();
    const key = new URL(req.url).searchParams.get("key");
    if (!key) return ok({ error: "key required" }, 400);
    const body = await req.json().catch(() => ({}));
    const plan = await prisma.plan.update({ where: { key }, data: { isActive: !!body.isActive } });
    return ok({ plan });
  } catch (err) {
    return handleError(err);
  }
}
