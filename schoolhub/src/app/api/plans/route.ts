import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { handleError, ok } from "@/lib/http";

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
