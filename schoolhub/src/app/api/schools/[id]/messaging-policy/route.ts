import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { ROLES } from "@/lib/constants";
import { recordAudit } from "@/lib/audit";
import { handleError, ok, AppError } from "@/lib/http";

const ADMIN: string[] = [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER];

async function assertSchoolAdmin(schoolId: string) {
  const ctx = await requireAuth();
  if (ctx.isPlatformAdmin) return ctx;
  if (!ctx.memberships.some((m) => m.schoolId === schoolId && ADMIN.includes(m.role))) throw new AppError("Not permitted", 403);
  return ctx;
}

// Read/set whether parents at this school may message each other (safeguarding:
// off by default). Stored as PlatformSetting messaging.p2p.<schoolId>.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await assertSchoolAdmin(params.id);
    let parentToParent = false;
    try { const row = await prisma.platformSetting.findUnique({ where: { key: `messaging.p2p.${params.id}` } }); parentToParent = row?.value === "true"; } catch {}
    return ok({ parentToParent });
  } catch (err) { return handleError(err); }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await assertSchoolAdmin(params.id);
    const b = await req.json().catch(() => ({}));
    const val = b.parentToParent === true ? "true" : "false";
    const key = `messaging.p2p.${params.id}`;
    await prisma.platformSetting.upsert({ where: { key }, create: { key, value: val }, update: { value: val } });
    await recordAudit({ action: "MESSAGING_POLICY_UPDATED", actorUserId: ctx.userId, actorEmail: ctx.email, schoolId: params.id, metadata: { parentToParent: val } });
    return ok({ parentToParent: val === "true" });
  } catch (err) { return handleError(err); }
}
