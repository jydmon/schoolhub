import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertStaffArea, listStaff } from "@/lib/platform-staff";
import { assertTenantAccess } from "@/lib/tenant";
import { managerCoversSchool } from "@/lib/platform-staff-logic";
import { schoolPolicyCompliance } from "@/lib/policy-compliance-school";
import { activationHistory } from "@/lib/activation";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string } };

// Consolidated Super-Admin / Account Manager view of one school: profile,
// subscription + approval, user stats, package, status/activation, policy
// compliance summary, recent support tickets, Account Manager assignment, and
// activation history. Platform-staff ("tenants" area); AMs limited to portfolio.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "tenants");
    assertTenantAccess(ctx, params.id);

    const school = await prisma.school.findUnique({
      where: { id: params.id },
      include: {
        group: { select: { name: true } },
        subscription: { include: { plan: true } },
        _count: { select: { memberships: true, students: true, campuses: true } },
      },
    });
    if (!school) throw new AppError("School not found", 404);

    const [tickets, staff, compliance, history] = await Promise.all([
      prisma.supportTicket.findMany({ where: { schoolId: params.id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, reference: true, subject: true, status: true, priority: true, escalated: true, createdAt: true } }),
      listStaff(),
      schoolPolicyCompliance(params.id).catch(() => null),
      activationHistory(params.id),
    ]);

    const managers = staff.filter((s: any) => s.roleKey === "account_manager" && s.status === "active");
    let assignedManager: any = null;
    if (school.accountManagerUserId) {
      const m = managers.find((x: any) => x.userId === school.accountManagerUserId);
      assignedManager = m ? { userId: m.userId, name: m.name || m.email, source: "assigned" } : { userId: school.accountManagerUserId, name: "Assigned manager", source: "assigned" };
    } else {
      const geo = managers.find((m: any) => managerCoversSchool({ counties: m.scopeCounties || [], countries: m.scopeCountries || [] }, school));
      if (geo) assignedManager = { userId: geo.userId, name: geo.name || geo.email, source: "geographic" };
    }

    const sub = school.subscription;
    const needsApproval = !!sub && sub.approvalMode === "manual" && sub.approvalStatus !== "approved";

    return ok({
      school: {
        id: school.id, name: school.name, slug: school.slug, status: school.status,
        activationStatus: school.activationStatus, activatedAt: school.activatedAt,
        logoUrl: school.logoUrl, trustName: school.group?.name || null,
        contactName: school.contactName, contactEmail: school.contactEmail, contactPhone: school.contactPhone,
        addressLine1: school.addressLine1, addressLine2: school.addressLine2, city: school.city, county: school.county, postcode: school.postcode, country: school.country,
        headTeacher: school.headTeacher, headTeacherEmail: school.headTeacherEmail, headTeacherPhone: school.headTeacherPhone,
        accountManagerUserId: school.accountManagerUserId, createdAt: school.createdAt,
      },
      subscription: sub ? { id: sub.id, planName: sub.plan?.name, planKey: sub.plan?.key, status: sub.status, renewalDate: sub.renewalDate, approvalMode: sub.approvalMode, approvalStatus: sub.approvalStatus, needsApproval } : null,
      stats: { users: school._count.memberships, students: school._count.students, campuses: school._count.campuses },
      compliance: compliance?.totals ?? null,
      tickets,
      assignedManager,
      managers: managers.map((m: any) => ({ userId: m.userId, name: m.name || m.email, email: m.email })),
      history,
    });
  } catch (err) { return handleError(err); }
}
