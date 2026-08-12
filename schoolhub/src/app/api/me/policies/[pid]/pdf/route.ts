import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { policiesForUser } from "@/lib/my-policies";
import { textPdf } from "@/lib/pdf";
import { handleError } from "@/lib/http";
import { NextResponse } from "next/server";

type Params = { params: { pid: string } };

// Download a policy the user is entitled to see as a PDF. If the policy has an
// uploaded document, redirect to it; otherwise render the in-system text.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const mine = await policiesForUser(ctx.userId);
    const meta = mine.find((p) => p.id === params.pid);
    if (!meta) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const policy = await prisma.policy.findUnique({ where: { id: params.pid } });
    if (!policy) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (policy.fileUrl) return NextResponse.redirect(policy.fileUrl);

    const paras = [
      `Version ${policy.version}${policy.effectiveDate ? ` · effective ${new Date(policy.effectiveDate).toLocaleDateString("en-GB")}` : ""}`,
      "",
      ...(policy.summary ? [policy.summary, ""] : []),
      policy.body || "(No content.)",
    ];
    const pdf = textPdf(policy.title, paras);
    const safe = policy.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
    return new NextResponse(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="policy-${safe}.pdf"` } });
  } catch (err) { return handleError(err); }
}
