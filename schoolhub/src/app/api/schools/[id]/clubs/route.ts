import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { listClubs, getClub, createClub, updateClub, setClubStatus, deleteClub, addMember, removeMember } from "@/lib/clubs";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// GET /clubs            → list clubs
// GET /clubs?clubId=xxx → one club with roster + sessions
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    const clubId = new URL(req.url).searchParams.get("clubId");
    if (clubId) return ok({ club: await getClub(params.id, clubId) });
    return ok({ clubs: await listClubs(params.id) });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CONTENT, params.id);
    const b = await req.json().catch(() => ({}));
    // Bulk manual import: { clubs: [...] }
    if (Array.isArray(b.clubs)) {
      let created = 0; const errors: any[] = [];
      for (let i = 0; i < b.clubs.length; i++) {
        try { await createClub({ ...b.clubs[i], schoolId: params.id, source: "import", actorUserId: ctx.userId }); created++; }
        catch (e: any) { errors.push({ row: i + 1, message: e?.message || "failed" }); }
      }
      return ok({ created, errors }, 201);
    }
    const res = await createClub({ ...b, schoolId: params.id, actorUserId: ctx.userId });
    return ok(res, 201);
  } catch (err) { return handleError(err); }
}

// PATCH handles: club edits, status toggle, and membership add/remove via `op`.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CONTENT, params.id);
    const b = await req.json().catch(() => ({}));
    if (b.op === "addMember") { const r = await addMember(params.id, String(b.clubId), String(b.studentId), b.status || "enrolled"); return ok(r); }
    if (b.op === "removeMember") { await removeMember(params.id, String(b.membershipId)); return ok({ ok: true }); }
    if (!b.id) return ok({ error: "id required" }, 400);
    const keys = Object.keys(b).filter((k) => k !== "id");
    if (keys.length === 1 && keys[0] === "status") await setClubStatus(params.id, String(b.id), String(b.status));
    else await updateClub(params.id, String(b.id), b);
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CONTENT, params.id);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return ok({ error: "id required" }, 400);
    await deleteClub(params.id, id);
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
