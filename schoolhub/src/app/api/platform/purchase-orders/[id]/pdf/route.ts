import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { poPdfParagraphs } from "@/lib/commerce";
import { textPdf } from "@/lib/pdf";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError } from "@/lib/http";

type Params = { params: { id: string } };

// Download a Purchase Order as a PDF. Recorded in the audit trail.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "subscriptions");
    const po = await prisma.purchaseOrder.findUnique({ where: { id: params.id } });
    if (!po) return new Response("Not found", { status: 404 });

    // Trust name (if the tenant belongs to an academy trust / group).
    let trustName: string | null = null;
    if (po.schoolId) {
      const s = await prisma.school.findUnique({ where: { id: po.schoolId }, select: { group: { select: { name: true } } } });
      trustName = s?.group?.name ?? null;
    }
    const paragraphs = poPdfParagraphs(po, { generatedBy: ctx.email, trustName, generatedAt: new Date().toLocaleString("en-GB") });
    const pdf = textPdf(`Purchase Order — ${po.schoolName}`, paragraphs);

    await recordAudit({ action: AUDIT.PO_DOWNLOADED, actorUserId: ctx.userId, actorEmail: ctx.email, schoolId: po.schoolId ?? undefined, targetType: "PurchaseOrder", targetId: po.id, metadata: { reference: po.reference } });

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${po.reference}.pdf"` },
    });
  } catch (err) { return handleError(err); }
}
