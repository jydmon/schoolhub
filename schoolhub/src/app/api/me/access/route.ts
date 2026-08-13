import { requireAuth } from "@/lib/session";
import { effectiveForUser } from "@/lib/roles";
import { handleError, ok } from "@/lib/http";

// The current user's effective permissions + page access per school, resolved
// through any tenant role customizations. Lets clients gate navigation/features.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const schoolId = new URL(req.url).searchParams.get("schoolId") || ctx.memberships[0]?.schoolId;
    if (!schoolId) return ok({ permissions: [], pages: [] });
    const roleKeys = ctx.memberships.filter((m) => m.schoolId === schoolId).map((m) => m.role);
    return ok({ schoolId, ...(await effectiveForUser(schoolId, roleKeys)) });
  } catch (err) { return handleError(err); }
}
