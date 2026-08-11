import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";
import { z } from "zod";

const createGroupSchema = z.object({ name: z.string().min(2) });

// List academy trusts / school groups.
export async function GET() {
  try {
    await requirePlatformAdmin();
    const groups = await prisma.schoolGroup.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { schools: true } } },
    });
    return ok({ groups });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePlatformAdmin();
    const { name } = createGroupSchema.parse(await req.json());
    const group = await prisma.schoolGroup.create({ data: { name } });
    await recordAudit({
      action: AUDIT.DATA_CHANGE,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "SchoolGroup",
      targetId: group.id,
      metadata: { name },
    });
    return ok({ group }, 201);
  } catch (err) {
    return handleError(err);
  }
}
