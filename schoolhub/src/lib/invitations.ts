import { prisma } from "./db";
import { hashPassword } from "./auth";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";
import { AppError } from "./http";
import { hashToken, hashCode, generateToken, generateCode, canActivate, roleLinksChildren, defaultExpiry } from "./invite-logic";

// Invitation lifecycle (DB). Access to SchoolHub is invitation-only: a user
// account is only created/enabled by accepting a school-issued invitation.
// Parents in particular cannot self-register — an invitation with their role and
// linked pupils is required. Raw token/code are returned once (to email) and
// never stored (only HMAC hashes are persisted).

export async function createInvitation(opts: {
  schoolId: string; email: string; role: string; studentRefs?: string[];
  requireMfa?: boolean; invitedById?: string; actorEmail?: string;
}) {
  const token = generateToken();
  const code = generateCode();
  const now = new Date();
  const inv = await prisma.invitation.create({
    data: {
      schoolId: opts.schoolId, email: opts.email.toLowerCase(), role: opts.role,
      studentRefs: JSON.stringify(opts.studentRefs ?? []), status: "pending",
      tokenHash: hashToken(token), codeHash: hashCode(code), invitedById: opts.invitedById ?? null,
      requireMfa: !!opts.requireMfa, expiresAt: defaultExpiry(now),
    },
  });
  await recordAudit({ action: AUDIT.INVITE_CREATED, schoolId: opts.schoolId, actorUserId: opts.invitedById, actorEmail: opts.actorEmail, targetType: "Invitation", targetId: inv.id, metadata: { email: opts.email, role: opts.role } });
  // token + code are delivered by email in production; returned here for the
  // caller to send. Never logged or persisted in raw form.
  return { invitation: publicInvite(inv), token, code, activationLink: `/onboard?token=${token}` };
}

export async function resendInvitation(schoolId: string, invId: string, actor: { userId?: string; email?: string }) {
  const inv = await prisma.invitation.findFirst({ where: { id: invId, schoolId } });
  if (!inv) throw new AppError("Invitation not found", 404);
  if (inv.status === "accepted") throw new AppError("Invitation already accepted", 409);
  const token = generateToken(); const code = generateCode();
  await prisma.invitation.update({ where: { id: inv.id }, data: { tokenHash: hashToken(token), codeHash: hashCode(code), status: "pending", expiresAt: defaultExpiry(new Date()) } });
  await recordAudit({ action: AUDIT.INVITE_RESENT, schoolId, actorUserId: actor.userId, actorEmail: actor.email, targetType: "Invitation", targetId: inv.id });
  return { token, code, activationLink: `/onboard?token=${token}` };
}

export async function revokeInvitation(schoolId: string, invId: string, actor: { userId?: string; email?: string }) {
  const inv = await prisma.invitation.findFirst({ where: { id: invId, schoolId } });
  if (!inv) throw new AppError("Invitation not found", 404);
  await prisma.invitation.update({ where: { id: inv.id }, data: { status: "revoked" } });
  await recordAudit({ action: AUDIT.INVITE_REVOKED, schoolId, actorUserId: actor.userId, actorEmail: actor.email, targetType: "Invitation", targetId: inv.id });
  return { ok: true };
}

/**
 * Accept an invitation: verify token+code, create/enable the user, grant the
 * role membership, and (for parents) link their children. Returns the user and
 * whether MFA setup is still required before full access.
 */
export async function acceptInvitation(opts: { token: string; code: string; fullName: string; password: string }) {
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(opts.token) } });
  if (!inv) throw new AppError("Invalid invitation", 400);
  const decision = canActivate(inv, opts.code, new Date());
  if (!decision.ok) throw new AppError(`Invitation ${decision.reason}`, 400);

  const email = inv.email.toLowerCase();
  const passwordHash = await hashPassword(opts.password);
  const existing = await prisma.user.findUnique({ where: { email } });
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, fullName: opts.fullName || existing.fullName, status: "active", emailVerified: true, sessionVersion: { increment: 1 } } })
    : await prisma.user.create({ data: { email, fullName: opts.fullName, passwordHash, status: "active", emailVerified: true } });

  // Grant the invited role for this tenant (idempotent).
  await prisma.membership.upsert({
    where: { userId_schoolId_role: { userId: user.id, schoolId: inv.schoolId, role: inv.role } },
    update: {}, create: { userId: user.id, schoolId: inv.schoolId, role: inv.role },
  });

  // Parent–child verification: link only to the pupils named in the invitation.
  let linkedChildren = 0;
  if (roleLinksChildren(inv.role)) {
    let refs: string[] = [];
    try { refs = JSON.parse(inv.studentRefs || "[]"); } catch { /* ignore */ }
    for (const ref of refs) {
      const st = await prisma.student.findFirst({ where: { schoolId: inv.schoolId, reference: ref } });
      if (!st) continue;
      await prisma.guardianLink.upsert({ where: { parentUserId_studentId: { parentUserId: user.id, studentId: st.id } }, update: {}, create: { schoolId: inv.schoolId, parentUserId: user.id, studentId: st.id, relationship: "Parent" } });
      linkedChildren++;
    }
  }

  await prisma.invitation.update({ where: { id: inv.id }, data: { status: "accepted", acceptedAt: new Date() } });
  await recordAudit({ action: AUDIT.INVITE_ACCEPTED, schoolId: inv.schoolId, actorUserId: user.id, actorEmail: email, targetType: "User", targetId: user.id, metadata: { role: inv.role, linkedChildren } });

  return { user, requireMfa: inv.requireMfa && !user.mfaEnabled, schoolId: inv.schoolId, role: inv.role, linkedChildren };
}

function publicInvite(inv: { id: string; email: string; role: string; status: string; requireMfa: boolean; expiresAt: Date; createdAt: Date; acceptedAt: Date | null }) {
  return { id: inv.id, email: inv.email, role: inv.role, status: inv.status, requireMfa: inv.requireMfa, expiresAt: inv.expiresAt, createdAt: inv.createdAt, acceptedAt: inv.acceptedAt };
}
