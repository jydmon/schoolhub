import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { ROLES } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

// The fleet available to this driver (their school's vehicles) with status and
// compliance (MOT / insurance / service / tax) flags.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const membership = await prisma.membership.findFirst({ where: { userId: ctx.userId, role: ROLES.DRIVER } });
    const schoolId = membership?.schoolId;
    if (!schoolId) return ok({ vehicles: [] });

    const vehicles = await prisma.vehicle.findMany({ where: { schoolId }, orderBy: { reference: "asc" } });
    const today = new Date(); const in30 = new Date(today.getTime() + 30 * 86400000);
    const flag = (d: string | null): "ok" | "due" | "overdue" | "none" => {
      if (!d) return "none";
      const due = new Date(`${d}T00:00:00`);
      if (isNaN(due.getTime())) return "none";
      if (due < today) return "overdue";
      if (due <= in30) return "due";
      return "ok";
    };
    const out = vehicles.map((v) => {
      const compliance = { mot: flag(v.motDue), insurance: flag(v.insuranceDue), service: flag(v.serviceDue), tax: flag(v.taxDue) };
      const anyOverdue = Object.values(compliance).includes("overdue");
      const anyDue = Object.values(compliance).includes("due");
      const status = !v.active ? "out_of_service" : anyOverdue ? "attention" : anyDue ? "due_soon" : "available";
      return { id: v.id, reference: v.reference, label: v.label, type: v.type, capacity: v.capacity, active: v.active, status, compliance, motDue: v.motDue, insuranceDue: v.insuranceDue, serviceDue: v.serviceDue, taxDue: v.taxDue };
    });
    return ok({ vehicles: out });
  } catch (err) { return handleError(err); }
}
