import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT, ROLES } from "./constants";
import { sendEmail } from "./email";

// Account activation for the commercial onboarding chain. A school is "activated"
// once an Account Manager / Super Admin approves payment or activates manually.
// Existing tenants default to "activated" (grandfathered); new tenants created
// via the onboarding flow start "pending" and are blocked until activated.

export function isSchoolActivated(school: { activationStatus?: string | null } | null | undefined): boolean {
  if (!school) return false;
  return (school.activationStatus ?? "activated") === "activated";
}

/** Activate a school: flips the gate, records an ActivationEvent + audit entry,
 *  and emails the tenant administrator. Used by payment approval and by manual
 *  activation (which carries a business justification). */
export async function activateSchool(opts: {
  schoolId: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  method: "invoice" | "manual";
  type: string; // payment_approved | manual | reactivated
  justification?: string | null;
}): Promise<void> {
  const now = new Date();
  await prisma.school.update({
    where: { id: opts.schoolId },
    data: { activationStatus: "activated", activatedAt: now, activatedByUserId: opts.actorUserId ?? null, status: "active" },
  });
  await prisma.activationEvent.create({
    data: { schoolId: opts.schoolId, type: opts.type, method: opts.method, justification: opts.justification ?? null, actorUserId: opts.actorUserId ?? null, actorEmail: opts.actorEmail ?? null },
  });
  await recordAudit({
    action: opts.method === "manual" ? AUDIT.ACCOUNT_MANUAL_ACTIVATED : AUDIT.ACCOUNT_ACTIVATED,
    actorUserId: opts.actorUserId, actorEmail: opts.actorEmail, schoolId: opts.schoolId,
    targetType: "School", targetId: opts.schoolId,
    metadata: { method: opts.method, type: opts.type, justification: opts.justification ?? undefined },
  });
  // Notify the tenant administrator (best-effort).
  try {
    const admin = await prisma.membership.findFirst({ where: { schoolId: opts.schoolId, role: ROLES.SCHOOL_ADMIN }, include: { user: { select: { email: true, fullName: true } } } });
    const school = await prisma.school.findUnique({ where: { id: opts.schoolId }, select: { name: true } });
    if (admin?.user?.email) await sendEmail({
      to: admin.user.email,
      subject: `Your SIPlat account is now active — ${school?.name ?? ""}`,
      body: `Hello ${admin.user.fullName || ""},\n\nGood news — ${school?.name ?? "your school"} has been activated on SIPlat. You and your school's users can now sign in and start using the platform.\n\nThank you,\nThe SIPlat team`,
    });
  } catch { /* email provider optional */ }
}

/** The activation history (newest first) for a school. */
export async function activationHistory(schoolId: string) {
  return prisma.activationEvent.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" } });
}
