import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { handleError, ok } from "@/lib/http";

// List the caller's AI drafts (optionally for one school).
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const schoolId = new URL(req.url).searchParams.get("schoolId") || undefined;
    const drafts = await prisma.aiDraft.findMany({
      where: { createdById: ctx.userId, ...(schoolId ? { schoolId } : {}) },
      orderBy: { createdAt: "desc" }, take: 50,
    });
    return ok({ drafts });
  } catch (err) {
    return handleError(err);
  }
}
