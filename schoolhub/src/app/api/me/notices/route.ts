import { requireAuth } from "@/lib/session";
import { listForUser, markRead, markAllRead, dismiss, canAuthor } from "@/lib/notices";
import { ROLES } from "@/lib/constants";
import { handleError, ok, AppError } from "@/lib/http";

const ADMIN_ROLES: string[] = [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER];

// The signed-in user's Announcement Centre: active notices with read/dismiss
// state, the current banner, and unread count. Works for every role.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const schoolIds = Array.from(new Set(ctx.memberships.map((m) => m.schoolId)));
    const data = await listForUser(ctx.userId, schoolIds);
    const authorSchools = Array.from(new Set(ctx.memberships.filter((m) => ADMIN_ROLES.includes(m.role)).map((m) => m.schoolId)));
    return ok({ ...data, canAuthor: canAuthor(ctx), isPlatformAdmin: ctx.isPlatformAdmin, authorSchools });
  } catch (err) { return handleError(err); }
}

// Read / dismiss actions. Body: { action: "read" | "read-all" | "dismiss", id?: string }
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const schoolIds = Array.from(new Set(ctx.memberships.map((m) => m.schoolId)));
    if (b.action === "read-all") return ok(await markAllRead(ctx.userId, schoolIds));
    if (!b.id) throw new AppError("Missing notice id", 400);
    if (b.action === "dismiss") return ok(await dismiss(ctx.userId, b.id));
    return ok(await markRead(ctx.userId, b.id));
  } catch (err) { return handleError(err); }
}
