import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { manageableSchoolIds } from "@/lib/support";
import { ticketReport, PRIORITY_LABEL, STATUS_LABEL } from "@/lib/support-tickets";
import { handleError, ok } from "@/lib/http";

// Support reporting dashboard — scoped to the schools the caller administers
// (all, for a platform admin). Powers the "Reports" view in Manage requests.
export async function GET() {
  try {
    const ctx = await requireAuth();
    let where: any;
    if (ctx.isPlatformAdmin) where = {};
    else { const ids = manageableSchoolIds(ctx); if (!ids.length) return ok({ canManage: false, report: null }); where = { schoolId: { in: ids } }; }

    const report = await ticketReport(where);

    // Friendly labels for schools + assignees.
    const schoolIds = Object.keys(report.bySchool);
    const assigneeIds = Object.keys(report.byAssignee);
    const [schools, assignees] = await Promise.all([
      schoolIds.length ? prisma.school.findMany({ where: { id: { in: schoolIds } }, select: { id: true, name: true } }) : [],
      assigneeIds.length ? prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, fullName: true } }) : [],
    ]);
    const schoolName = new Map(schools.map((s) => [s.id, s.name]));
    const assigneeName = new Map(assignees.map((u) => [u.id, u.fullName]));

    return ok({
      canManage: true,
      report: {
        ...report,
        byStatusLabelled: Object.entries(report.byStatus).map(([k, v]) => ({ key: k, label: STATUS_LABEL[k] || k, value: v })),
        byPriorityLabelled: Object.entries(report.byPriority).map(([k, v]) => ({ key: k, label: PRIORITY_LABEL[k] || k, value: v })),
        byCategoryLabelled: Object.entries(report.byCategory).map(([k, v]) => ({ key: k, label: k, value: v })),
        bySchoolLabelled: Object.entries(report.bySchool).map(([k, v]) => ({ key: k, label: schoolName.get(k) || k, value: Number(v) })).sort((a, b) => b.value - a.value),
        byAssigneeLabelled: Object.entries(report.byAssignee).map(([k, v]) => ({ key: k, label: assigneeName.get(k) || "Unassigned", value: Number(v) })).sort((a, b) => b.value - a.value),
      },
    });
  } catch (err) { return handleError(err); }
}
