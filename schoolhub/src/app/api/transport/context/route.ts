import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { ROLES } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

// Which school(s) this transport manager serves. The portal uses this to scope
// every subsequent call and to offer a school switcher when they serve more
// than one.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const memberships = await prisma.membership.findMany({
      where: { userId: ctx.userId, role: { in: [ROLES.TRANSPORT_MANAGER, ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER] } },
      include: { school: { select: { id: true, name: true } } },
    });
    const seen = new Map<string, string>();
    for (const m of memberships) if (m.school) seen.set(m.school.id, m.school.name);
    const schools = Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
    return ok({ schools, email: ctx.email });
  } catch (err) { return handleError(err); }
}
