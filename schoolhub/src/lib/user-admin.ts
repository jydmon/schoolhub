import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT, ROLES } from "./constants";
import { AppError } from "./http";
import { createVerificationToken } from "./auth";

// A school must always keep at least one active School Administrator, so a role
// change or removal can never leave it with none (which would lock everyone
// out of tenant management).
async function assertNotLastAdmin(schoolId: string, membershipId: string, role: string) {
  if (role !== ROLES.SCHOOL_ADMIN) return;
  const otherAdmins = await prisma.membership.count({
    where: { schoolId, role: ROLES.SCHOOL_ADMIN, id: { not: membershipId } },
  });
  if (otherAdmins === 0) throw new AppError("This is the school's only School Administrator — assign another administrator before changing or removing this role.", 409);
}

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
  // Changing the only admin's role away would lock the school out.
  await assertNotLastAdmin(opts.schoolId, opts.membershipId, membership.role);
  // If the user ALREADY holds the target role, changing this membership to it
  // would collide with the unique (userId, schoolId, role) key. Treat that as
  // "this role is redundant" and remove this membership instead of erroring —
  // the net effect (user ends up with just the target role) is what the admin wants.
  const clash = await prisma.membership.findFirst({ where: { userId: membership.userId, schoolId: opts.schoolId, role: opts.role } });
  if (clash) {
    await prisma.membership.delete({ where: { id: opts.membershipId } });
    await prisma.user.update({ where: { id: membership.userId }, data: { sessionVersion: { increment: 1 } } }).catch(() => {});
    await recordAudit({ action: AUDIT.USER_ROLE_CHANGED ?? "USER_ROLE_CHANGED", schoolId: opts.schoolId, actorUserId: opts.actor.userId, actorEmail: opts.actor.email, targetType: "Membership", targetId: opts.membershipId, metadata: { from: membership.role, to: opts.role, note: "removed duplicate role; user already held target role" } });
    return { ok: true, role: opts.role, mergedDuplicate: true };
  }
  await prisma.membership.update({ where: { id: opts.membershipId }, data: { role: opts.role } });
  await prisma.user.update({ where: { id: membership.userId }, data: { sessionVersion: { increment: 1 } } }).catch(() => {});
  await recordAudit({ action: AUDIT.USER_ROLE_CHANGED ?? "USER_ROLE_CHANGED", schoolId: opts.schoolId, actorUserId: opts.actor.userId, actorEmail: opts.actor.email, targetType: "Membership", targetId: opts.membershipId, metadata: { from: membership.role, to: opts.role } });
  return { ok: true, role: opts.role };
}

// Remove a specific role from a user at this school (delete the membership row).
// Blocked if it is the school's last School Administrator. Bumps sessionVersion
// so the change takes effect on the user's next request.
export async function removeMembershipRole(opts: { schoolId: string; membershipId: string; actor: { userId?: string; email?: string } }) {
  const membership = await prisma.membership.findUnique({ where: { id: opts.membershipId } });
  if (!membership || membership.schoolId !== opts.schoolId) throw new AppError("Membership not found in this school", 404);
  await assertNotLastAdmin(opts.schoolId, opts.membershipId, membership.role);
  await prisma.membership.delete({ where: { id: opts.membershipId } });
  await prisma.user.update({ where: { id: membership.userId }, data: { sessionVersion: { increment: 1 } } }).catch(() => {});
  await recordAudit({ action: AUDIT.USER_ROLE_CHANGED ?? "USER_ROLE_CHANGED", schoolId: opts.schoolId, actorUserId: opts.actor.userId, actorEmail: opts.actor.email, targetType: "Membership", targetId: opts.membershipId, metadata: { removed: membership.role } });
  return { ok: true, removed: membership.role };
}

export async function recordLoginEvent(e: { userId?: string | null; email: string; schoolId?: string | null; ip?: string | null; device?: string | null; result: string }) {
  await prisma.loginEvent.create({ data: { userId: e.userId ?? null, email: e.email.toLowerCase(), schoolId: e.schoolId ?? null, ip: e.ip ?? null, device: e.device ?? null, result: e.result } }).catch(() => {});
}

export async function listLoginHistory(schoolId: string, userId: string) {
  await assertInTenant(userId, schoolId);
  return prisma.loginEvent.findMany({ where: { userId }, orderBy: { at: "desc" }, take: 50 });
}
