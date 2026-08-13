import { prisma } from "./db";
import { recordAudit } from "./audit";
import { notify } from "./transport";
import { signImpersonation } from "./auth";
import type { AuthContext } from "./rbac";

// Item 13 — secure, approval-gated, time-bound Super-Admin support access.
// The admin requests; the target user must approve; access is revocable and
// auto-expires; every step is audited.

const MAX_DURATION = 8 * 60; // minutes

export function serialize(r: any, now = Date.now()) {
  const expired = r.expiresAt && new Date(r.expiresAt).getTime() < now && (r.status === "approved" || r.status === "active");
  return {
    id: r.id, requesterName: r.requesterName, requesterEmail: r.requesterEmail,
    targetName: r.targetName, targetEmail: r.targetEmail, reason: r.reason,
    status: expired ? "expired" : r.status, durationMins: r.durationMins,
    requestedAt: r.requestedAt, respondedAt: r.respondedAt, approvedAt: r.approvedAt,
    expiresAt: r.expiresAt, startedAt: r.startedAt, endedAt: r.endedAt, endedReason: r.endedReason,
    minutesLeft: r.expiresAt && !r.endedAt ? Math.max(0, Math.round((new Date(r.expiresAt).getTime() - now) / 60000)) : null,
  };
}

/** A super admin requests access to a user's portal. */
export async function createRequest(admin: AuthContext, input: { targetUserId?: string; targetEmail?: string; reason: string; durationMins?: number }) {
  const reason = (input.reason || "").trim();
  if (!reason) throw new Error("A reason for access is required.");
  const target = input.targetUserId
    ? await prisma.user.findUnique({ where: { id: input.targetUserId }, select: { id: true, fullName: true, email: true } })
    : await prisma.user.findUnique({ where: { email: (input.targetEmail || "").trim().toLowerCase() }, select: { id: true, fullName: true, email: true } });
  if (!target) throw new Error("No user found with that email.");
  if (target.id === admin.userId) throw new Error("You can't request access to your own account.");
  const durationMins = Math.min(MAX_DURATION, Math.max(5, input.durationMins || 60));

  const req = await prisma.supportAccessRequest.create({
    data: {
      requesterId: admin.userId, requesterName: admin.fullName, requesterEmail: admin.email,
      targetUserId: target.id, targetName: target.fullName, targetEmail: target.email,
      reason, durationMins, status: "pending",
    },
  });
  await recordAudit({ action: "SUPPORT_ACCESS_REQUESTED", actorUserId: admin.userId, actorEmail: admin.email, targetType: "SupportAccessRequest", targetId: req.id, metadata: { target: target.email, durationMins } });
  await notify([target.id], { kind: "support_access", title: "Support access request", body: `${admin.fullName || admin.email} is requesting temporary access to your portal to help troubleshoot. Reason: ${reason}`, schoolId: null }).catch(() => {});
  return serialize(req);
}

/** The target user approves / rejects / revokes. */
export async function respond(userId: string, requestId: string, action: "approve" | "reject" | "revoke") {
  const req = await prisma.supportAccessRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new Error("Request not found");
  if (req.targetUserId !== userId) throw new Error("This request is not for you.");
  const now = new Date();
  let data: any = {};
  if (action === "approve") {
    if (req.status !== "pending") throw new Error("This request can no longer be approved.");
    data = { status: "approved", respondedAt: now, approvedAt: now, expiresAt: new Date(now.getTime() + req.durationMins * 60000) };
  } else if (action === "reject") {
    if (req.status !== "pending") throw new Error("This request can no longer be rejected.");
    data = { status: "rejected", respondedAt: now, endedAt: now, endedReason: "rejected" };
  } else if (action === "revoke") {
    if (!["approved", "active"].includes(req.status)) throw new Error("There is no active access to revoke.");
    data = { status: "revoked", endedAt: now, endedReason: "revoked" };
  }
  const updated = await prisma.supportAccessRequest.update({ where: { id: requestId }, data });
  await recordAudit({ action: `SUPPORT_ACCESS_${action.toUpperCase()}`, actorUserId: userId, targetType: "SupportAccessRequest", targetId: requestId, metadata: { by: "target_user" } });
  await notify([req.requesterId], { kind: "support_access", title: `Support access ${action === "approve" ? "approved" : action === "reject" ? "rejected" : "revoked"}`, body: `${req.targetName || req.targetEmail} ${action}d your access request.`, schoolId: null }).catch(() => {});
  return serialize(updated);
}

/** The admin starts an approved session → returns an impersonation token. */
export async function startSession(admin: AuthContext, requestId: string): Promise<{ token: string; ttl: number; request: any }> {
  const req = await prisma.supportAccessRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new Error("Request not found");
  if (req.requesterId !== admin.userId) throw new Error("This is not your request.");
  if (!["approved", "active"].includes(req.status)) throw new Error("This request is not approved (or has ended).");
  const now = Date.now();
  if (req.expiresAt && new Date(req.expiresAt).getTime() <= now) throw new Error("This access window has expired.");
  const ttl = req.expiresAt ? Math.max(30, Math.floor((new Date(req.expiresAt).getTime() - now) / 1000)) : req.durationMins * 60;

  const updated = await prisma.supportAccessRequest.update({ where: { id: requestId }, data: { status: "active", startedAt: req.startedAt || new Date() } });
  await recordAudit({ action: "SUPPORT_ACCESS_STARTED", actorUserId: admin.userId, actorEmail: admin.email, targetType: "SupportAccessRequest", targetId: requestId, metadata: { target: req.targetEmail } });
  await notify([req.targetUserId], { kind: "support_access", title: "Support session started", body: `${admin.fullName || admin.email} has started a support session on your portal. You can revoke it at any time.`, schoolId: null }).catch(() => {});
  const token = signImpersonation({ sub: req.targetUserId, by: admin.userId, rid: req.id }, ttl);
  return { token, ttl, request: serialize(updated) };
}

/** End an active session (admin stop / expiry). */
export async function endSession(requestId: string, actorUserId: string, reason = "ended_by_admin") {
  const req = await prisma.supportAccessRequest.findUnique({ where: { id: requestId } });
  if (!req) return;
  if (["active", "approved"].includes(req.status)) {
    await prisma.supportAccessRequest.update({ where: { id: requestId }, data: { status: "ended", endedAt: new Date(), endedReason: reason } });
    await recordAudit({ action: "SUPPORT_ACCESS_ENDED", actorUserId, targetType: "SupportAccessRequest", targetId: requestId, metadata: { reason } });
    await notify([req.targetUserId], { kind: "support_access", title: "Support session ended", body: "The support session on your portal has ended.", schoolId: null }).catch(() => {});
  }
}

export async function listForAdmin(adminId: string) {
  const rows = await prisma.supportAccessRequest.findMany({ where: { requesterId: adminId }, orderBy: { requestedAt: "desc" }, take: 100 });
  return rows.map((r) => serialize(r));
}

/** Requests targeting a user — the pending ones they must action, plus history. */
export async function listForUser(userId: string) {
  const rows = await prisma.supportAccessRequest.findMany({ where: { targetUserId: userId }, orderBy: { requestedAt: "desc" }, take: 50 });
  const items = rows.map((r) => serialize(r));
  return { items, pending: items.filter((r) => r.status === "pending"), active: items.filter((r) => r.status === "active") };
}
