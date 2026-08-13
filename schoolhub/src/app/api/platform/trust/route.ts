import { requirePlatformAdmin } from "@/lib/session";
import { listTrustDocuments, getTrustDocument, createTrustDocument, updateTrustDocument, transitionTrustDocument, deleteTrustDocument } from "@/lib/trust";
import { handleError, ok } from "@/lib/http";

// Super-Admin / SaaS Document Management System. Platform-scoped (no tenant).
export async function GET(req: Request) {
  try {
    const ctx = await requirePlatformAdmin();
    void ctx;
    const sp = new URL(req.url).searchParams;
    const id = sp.get("id");
    if (id) return ok({ document: await getTrustDocument(id) });
    return ok({ documents: await listTrustDocuments({ status: sp.get("status") || undefined, category: sp.get("category") || undefined, q: sp.get("q")?.trim() || undefined }) });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePlatformAdmin();
    const b = await req.json().catch(() => ({}));
    return ok(await createTrustDocument(b, ctx.userId), 201);
  } catch (err) { return handleError(err); }
}

// PATCH: content edits (with fields) or a lifecycle transition ({ id, status }).
export async function PATCH(req: Request) {
  try {
    const ctx = await requirePlatformAdmin();
    const b = await req.json().catch(() => ({}));
    if (!b.id) return ok({ error: "id required" }, 400);
    const keys = Object.keys(b).filter((k) => k !== "id" && k !== "note");
    if (keys.length === 1 && keys[0] === "status") return ok(await transitionTrustDocument(String(b.id), String(b.status), ctx.userId, b.note));
    return ok(await updateTrustDocument(String(b.id), b, ctx.userId));
  } catch (err) { return handleError(err); }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await requirePlatformAdmin();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return ok({ error: "id required" }, 400);
    return ok(await deleteTrustDocument(id, ctx.userId));
  } catch (err) { return handleError(err); }
}
