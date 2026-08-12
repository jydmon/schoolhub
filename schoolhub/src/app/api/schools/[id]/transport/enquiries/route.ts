import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { transportEnquirySchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Transport enquiries — general questions/complaints about the service that the
// office triages (distinct from a daily transport request).
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const status = new URL(req.url).searchParams.get("status") || undefined;
    const enquiries = await prisma.transportEnquiry.findMany({
      where: { schoolId: params.id, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" }, take: 300,
    });
    return ok({ enquiries });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const i = transportEnquirySchema.parse(await req.json());
    const enquiry = await prisma.transportEnquiry.create({
      data: { schoolId: params.id, name: i.name, contact: i.contact || null, studentId: i.studentId || null, subject: i.subject, message: i.message || null, source: "manual" },
    });
    await recordAudit({ action: AUDIT.TRANSPORT_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "TransportEnquiry", targetId: enquiry.id, metadata: { op: "create" } });
    return ok({ enquiry }, 201);
  } catch (err) { return handleError(err); }
}
