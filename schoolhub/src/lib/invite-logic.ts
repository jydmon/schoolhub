// Pure invitation logic — no DB. Access to SchoolHub is invitation-only; this
// module handles the token/code hashing (HMAC — raw values are never stored),
// expiry, activation eligibility, and role validation. DB flows live in
// src/lib/invitations.ts. Unit-tested in tests/invite.test.ts.

import { createHmac, timingSafeEqual, randomBytes, randomInt } from "crypto";
import { SCHOOL_ROLES } from "./constants";

const SECRET = () => process.env.INVITE_SECRET || process.env.JWT_SECRET || "dev-only-change-me";

/** HMAC of the activation-link token (raw token never stored). */
export function hashToken(raw: string): string {
  return createHmac("sha256", SECRET()).update("t:" + raw).digest("hex");
}
/** HMAC of the short activation code (raw code never stored). */
export function hashCode(code: string): string {
  return createHmac("sha256", SECRET()).update("c:" + String(code).trim()).digest("hex");
}
export function verifyHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; }
}

/** A URL-safe invitation token for the activation link. */
export function generateToken(): string {
  return randomBytes(24).toString("base64url");
}
/** A 6-digit activation code the invitee also enters (defence in depth). */
export function generateCode(): string {
  return String(randomInt(100000, 1000000));
}

export function isExpired(expiresAt: Date | string, now: Date): boolean {
  return now.getTime() > new Date(expiresAt).getTime();
}

export type InviteLike = { status: string; expiresAt: Date | string; codeHash: string };

/** Whether an invitation can be activated with the supplied code, right now. */
export function canActivate(inv: InviteLike, code: string, now: Date): { ok: boolean; reason: string } {
  if (inv.status === "accepted") return { ok: false, reason: "already accepted" };
  if (inv.status === "revoked") return { ok: false, reason: "revoked" };
  if (isExpired(inv.expiresAt, now)) return { ok: false, reason: "expired" };
  if (!verifyHash(hashCode(code), inv.codeHash)) return { ok: false, reason: "invalid code" };
  return { ok: true, reason: "ok" };
}

/** Validate/normalize a requested role to a real school role. */
export function normalizeRole(role: string): string | null {
  const r = String(role || "").trim();
  return (SCHOOL_ROLES as readonly string[]).includes(r) ? r : null;
}

/** Parents are linked to children; other roles are not. */
export function roleLinksChildren(role: string): boolean {
  return role === "Parent";
}

/** Default invitation lifetime (7 days). */
export function defaultExpiry(now: Date): Date {
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
}
