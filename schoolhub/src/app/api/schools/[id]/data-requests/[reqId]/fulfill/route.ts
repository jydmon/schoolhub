import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; reqId: string } };

// Fulfil a data subject request: EXPORT returns a portable JSON bundle; DELETION
// erases a student (cascade) or anonymises a user, then marks the request done.
export async function POST(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_SCHOOL_CONFIG, params.id);
    const dr = await prisma.dataRequest.findFirst({ where: { id: params.reqId, schoolId: params.id } });
    if (!dr) return ok({ error: "Not found" }, 404);

    let bundle: any = null;
    if (dr.type === "export") {
      if (dr.subjectType === "student") {
        bundle = await prisma.student.findFirst({
          where: { id: dr.subjectId, schoolId: params.id },
          include: { transportProfile: true, guardianLinks: true, emergencyContacts: true, approvedCollectors: true, rewards: true, boardings: true, tripLinks: true },
        });
      } else {
        bundle = await prisma.user.findUnique({ where: { id: dr.subjectId }, select: { id: true, email: true, fullName: true, phone: true, addressLine1: true, city: true, postcode: true, preferredLanguage: true, memberships: true, guardianLinks: true } });
      }
    } else {
      // deletion / erasure
      if (dr.subjectType === "student") {
        await prisma.student.deleteMany({ where: { id: dr.subjectId, schoolId: params.id } });
      } else {
        await prisma.user.update({ where: { id: dr.subjectId }, data: { fullName: "Redacted", email: `redacted+${dr.subjectId}@deleted.invalid`, phone: null, addressLine1: null, addressLine2: null, city: null, postcode: null, status: "suspended", sessionVersion: { increment: 1 } } });
      }
    }

    await prisma.dataRequest.update({ where: { id: dr.id }, data: { status: "fulfilled", completedAt: new Date() } });
    await recordAudit({ action: AUDIT.DSR_FULFILLED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "DataRequest", targetId: dr.id, metadata: { type: dr.type, subjectType: dr.subjectType } });
    await recordAudit({ action: AUDIT.SAFEGUARDING, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, metadata: { dsr: dr.type } });
    return ok({ ok: true, ...(bundle ? { export: bundle } : {}) });
  } catch (err) { return handleError(err); }
}
