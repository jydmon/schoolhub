import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/session";
import { handleError, ok } from "@/lib/http";

// Platform-wide audit trail (super admin only).
export async function GET(req: Request) {
  try {
    await requirePlatformAdmin();
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");
    const entries = await prisma.auditLog.findMany({
      where: action ? { action } : undefined,
      orderBy: { createdAt: "desc" },
      take: 300,
      include: { school: { select: { name: true } } },
    });
    return ok({ entries });
  } catch (err) {
    return handleError(err);
  }
}
