import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { listRelationships, createRelationship } from "@/lib/guardian-relationships";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };
const ipOf = (req: Request) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

// List guardian relationships for a school (optionally filtered by pupil/status).
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const q = new URL(req.url).searchParams;
    const rels = await listRelationships(params.id, { studentId: q.get("student") || undefined, status: q.get("status") || undefined });
    return ok({ relationships: rels });
  } catch (err) { return handleError(err); }
}

// Create a new (draft) guardian relationship for a pupil.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const b = await req.json().catch(() => ({}));
    const rel = await createRelationship(params.id, {
      studentId: String(b.studentId || ""), guardianName: String(b.guardianName || ""), guardianEmail: String(b.guardianEmail || ""),
      guardianPhone: b.guardianPhone, relationship: b.relationship, hasParentalResponsibility: b.hasParentalResponsibility,
      isPrimaryContact: b.isPrimaryContact, isEmergencyContact: b.isEmergencyContact, collectionAuthorised: b.collectionAuthorised,
      custodyArrangement: b.custodyArrangement,
    }, { userId: ctx.userId, email: ctx.email, role: "school", ip: ipOf(req) });
    return ok({ relationship: rel }, 201);
  } catch (err) { return handleError(err); }
}
