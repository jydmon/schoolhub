import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { todayStr } from "@/lib/transport";
import { ROLES } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

// Pre-trip vehicle safety checks completed by a driver.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const checks = await prisma.vehicleCheck.findMany({ where: { driverUserId: ctx.userId }, orderBy: { at: "desc" }, take: 40 });
    return ok({ checks: checks.map((c) => ({ id: c.id, date: c.date, vehicleId: c.vehicleId, journeyId: c.journeyId, passed: c.passed, defects: c.defects, items: safe(c.itemsJson), at: c.at })) });
  } catch (err) { return handleError(err); }
}

function safe(s: string) { try { return JSON.parse(s || "{}"); } catch { return {}; } }

// Submit a completed vehicle check. `items` is a map of check-item -> status
// ("ok" | "defect" | "na"); any "defect", or free-text defects, fails the check.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const membership = await prisma.membership.findFirst({ where: { userId: ctx.userId, role: ROLES.DRIVER } });
    const schoolId = membership?.schoolId;
    if (!schoolId) return ok({ error: "No driver school found" }, 400);
    const items = (b.items && typeof b.items === "object") ? b.items : {};
    const hasDefectItem = Object.values(items).some((v) => v === "defect");
    const defects = String(b.defects || "").trim();
    const passed = !hasDefectItem && !defects;

    let vehicleId: string | null = b.vehicleId || null;
    if (!vehicleId && b.journeyId) {
      const j = await prisma.journey.findFirst({ where: { id: String(b.journeyId), driverUserId: ctx.userId }, select: { vehicleId: true } });
      vehicleId = j?.vehicleId || null;
    }
    const check = await prisma.vehicleCheck.create({
      data: { schoolId, driverUserId: ctx.userId, vehicleId, journeyId: b.journeyId || null, date: b.date || todayStr(), passed, defects: defects || null, itemsJson: JSON.stringify(items) },
    });

    // A failed check raises a transport incident so the office is alerted.
    if (!passed) {
      await prisma.incident.create({ data: { schoolId, journeyId: b.journeyId || null, reportedByUserId: ctx.userId, type: "vehicle_defect", severity: "high", status: "open", notes: `Vehicle check failed${defects ? `: ${defects}` : ""}${hasDefectItem ? ` (defective items: ${Object.entries(items).filter(([, v]) => v === "defect").map(([k]) => k).join(", ")})` : ""}` } }).catch(() => {});
    }
    return ok({ check, passed }, 201);
  } catch (err) { return handleError(err); }
}
