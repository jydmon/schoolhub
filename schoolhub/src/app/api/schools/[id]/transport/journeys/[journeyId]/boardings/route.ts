import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; journeyId: string } };

// The check-in / check-out register for one journey: which pupils boarded,
// were dropped off, or were absent, and when.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);

    const journey = await prisma.journey.findFirst({
      where: { id: params.journeyId, schoolId: params.id },
      include: {
        route: { select: { name: true } },
        boardings: {
          include: { student: { select: { firstName: true, lastName: true, yearGroup: true } } },
          orderBy: { at: "asc" },
        },
      },
    });
    if (!journey) return ok({ error: "Not found" }, 404);

    const boardings = journey.boardings.map((b) => ({
      id: b.id, studentId: b.studentId,
      name: `${b.student.firstName} ${b.student.lastName}`,
      yearGroup: b.student.yearGroup, status: b.status, at: b.at,
    }));
    return ok({
      journey: { id: journey.id, routeName: journey.route.name, session: journey.session, status: journey.status, date: journey.date },
      boardings,
    });
  } catch (err) { return handleError(err); }
}
