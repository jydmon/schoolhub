import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { userAnalytics, roleAnalytics, systemUsage } from "@/lib/usage";
import { handleError, ok } from "@/lib/http";

// Usage analytics for the super-admin. ?view=users|roles|system
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(req.url);
    const view = url.searchParams.get("view") || "system";
    const area = view === "users" ? "analytics" : "usage";
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, area);
    const days = Number(url.searchParams.get("days") || "30");
    const schoolId = url.searchParams.get("school") || undefined;
    if (view === "users") {
      const role = url.searchParams.get("role") || undefined;
      return ok({ users: await userAnalytics({ role, schoolId, days, limit: 200 }) });
    }
    if (view === "roles") {
      return ok({ roles: await roleAnalytics(["Parent", "Teacher"], { schoolId, days }) });
    }
    return ok({ system: await systemUsage(days) });
  } catch (err) { return handleError(err); }
}
