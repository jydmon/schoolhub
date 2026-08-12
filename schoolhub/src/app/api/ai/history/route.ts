import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { handleError, ok } from "@/lib/http";

// The signed-in user's own assistant search history. Scoped to the user — a
// person only ever sees and manages their own past questions.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const schoolId = new URL(req.url).searchParams.get("schoolId") || undefined;
    const items = await prisma.aiQuery.findMany({
      where: { userId: ctx.userId, ...(schoolId ? { schoolId } : {}) },
      orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, question: true, answer: true, citations: true, found: true, lang: true, createdAt: true },
    });
    return ok({ items });
  } catch (err) { return handleError(err); }
}

// Delete one past search (?id=…) or all of the user's history (?all=1).
export async function DELETE(req: Request) {
  try {
    const ctx = await requireAuth();
    const sp = new URL(req.url).searchParams;
    if (sp.get("all") === "1") {
      await prisma.aiQuery.deleteMany({ where: { userId: ctx.userId } });
      return ok({ ok: true });
    }
    const id = sp.get("id");
    if (!id) return ok({ error: "id or all=1 required" }, 400);
    await prisma.aiQuery.deleteMany({ where: { id, userId: ctx.userId } }); // deleteMany enforces ownership
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
