import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";
import { AppError } from "./http";
import { createVerificationToken } from "./auth";

// School-administrator user controls. Every action is tenant-scoped (the target
// user must be a member of the acting admin's school) and audited. Disable /
// suspend / revoke all bump sessionVersion, which invalidates the user's live
// sessions immediately.

async function assertInTenant(userId: string, schoolId: string) {
  const member = await prisma.membership.findFirst({ where: { userId, schoolId } });
  if (!member) throw new AppError("User is not a member of this school", 403);
  return member;
}

export async function userAdminAction(opts: { schoolId: string; userId: string; action: "disable" | "suspend" | "reactivate" | "revoke" | "reset_password"; actor: { userId?: string; email?: string } }) {
  const user = await prisma.user.findUnique({ where: { id: opts.userId } });
  if (!user) throw new AppError("User not found", 404);
  await assertInTenant(opts.userId, opts.schoolId);

  if (opts.action === "reset_password") {
    const token = await createVerificationToken(opts.userId, "password_reset");
    await recordAudit({ action: AUDIT.PASSWORD_RESET_REQUESTED, schoolId: opts.schoolId, actorUserId: opts.actor.userId, actorEmail: opts.actor.email, targetType: "User", targetId: opts.userId });
    // token is emailed in production; returned here for the caller to send.
    return { ok: true, action: opts.action, resetToken: token };
  }

  const statusMap: Record<string, string | undefined> = { disable: "disabled", suspend: "suspended", reactivate: "active", revoke: undefined };
  const data: Record<string, unknown> = {};
  const newStatus = statusMap[opts.action];
  if (newStatus) data.status = newStatus;
  if (opts.action !== "reactivate") data.sessionVersion = { increment: 1 }; // revoke live sessions

  await prisma.user.update({ where: { id: opts.userId }, data });
  const auditAction = { disable: AUDIT.USER_DISABLED, suspend: AUDIT.USER_SUSPENDED, reactivate: AUDIT.USER_REACTIVATED, revoke: AUDIT.USER_ACCESS_REVOKED }[opts.action];
  await recordAudit({ action: auditAction, schoolId: opts.schoolId, actorUserId: opts.actor.userId, actorEmail: opts.actor.email, targetType: "User", targetId: opts.userId });
  return { ok: true, action: opts.action };
}

// Change the role attached to a specific membership row (a user may hold more
// than one role in a school, so this is keyed by membershipId, not userId).
export async function setMembershipRole(opts: { schoolId: string; membershipId: string; role: string; actor: { userId?: string; email?: string } }) {
  const membership = await prisma.membership.findUnique({ where: { id: opts.membershipId } });
  if (!membership || membership.schoolId !== opts.schoolId) throw new AppError("Membership not found in this school", 404);
  if (membership.role === opts.role) return { ok: true, role: opts.role, unchanged: true };
  // The (userId, schoolId, role) unique constraint blocks moving to a role the user already holds.
  const clash = await prisma.membership.findFirst({ where: { userId: membership.userId, schoolId: opts.schoolId, role: opts.role } });
  if (clash) throw new AppError("This user already has that role at this school", 409);
  await prisma.membership.update({ where: { id: opts.membershipId }, data: { role: opts.role } });
  await recordAudit({ action: AUDIT.USER_ROLE_CHANGED ?? "USER_ROLE_CHANGED", schoolId: opts.schoolId, actorUserId: opts.actor.userId, actorEmail: opts.actor.email, targetType: "Membership", targetId: opts.membershipId, metadata: { from: membership.role, to: opts.role } });
  return { ok: true, role: opts.role };
}

export async function recordLoginEvent(e: { userId?: string | null; email: string; schoolId?: string | null; ip?: string | null; device?: string | null; result: string }) {
  await prisma.loginEvent.create({ data: { userId: e.userId ?? null, email: e.email.toLowerCase(), schoolId: e.schoolId ?? null, ip: e.ip ?? null, device: e.device ?? null, result: e.result } }).catch(() => {});
}

export async function listLoginHistory(schoolId: string, userId: string) {
  await assertInTenant(userId, schoolId);
  return prisma.loginEvent.findMany({ where: { userId }, orderBy: { at: "desc" }, take: 50 });
}
