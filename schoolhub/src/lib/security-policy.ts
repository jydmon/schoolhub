import { prisma } from "@/lib/db";

/**
 * SaaS-owner (Super Administrator) configurable security policy, stored as
 * key/value rows in PlatformSetting. Reads are fault-tolerant: if the table or
 * a key is missing, sensible defaults apply so authentication never breaks.
 */
export type SecurityPolicy = {
  passwordExpiryDays: number; // 0 = never expires
  passwordGraceDays: number;  // days a user may defer changing an expired password
  mfaRequired: boolean;       // when true, MFA enrolment is enforced for all users
};

// Defaults chosen for a safe rollout: 90-day expiry (spec default) with a short
// grace window, and MFA *not* forced until the Super Admin turns it on.
const DEFAULTS: SecurityPolicy = { passwordExpiryDays: 90, passwordGraceDays: 3, mfaRequired: false };

const KEYS = { exp: "password.expiryDays", grace: "password.graceDays", mfa: "security.mfaRequired" };

function num(v: string | undefined, d: number) {
  const n = v != null ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : d;
}

export async function getSecurityPolicy(): Promise<SecurityPolicy> {
  try {
    const rows = await prisma.platformSetting.findMany({ where: { key: { in: Object.values(KEYS) } } });
    const m = new Map(rows.map((r) => [r.key, r.value]));
    return {
      passwordExpiryDays: num(m.get(KEYS.exp), DEFAULTS.passwordExpiryDays),
      passwordGraceDays: num(m.get(KEYS.grace), DEFAULTS.passwordGraceDays),
      mfaRequired: m.has(KEYS.mfa) ? m.get(KEYS.mfa) === "true" : DEFAULTS.mfaRequired,
    };
  } catch {
    return DEFAULTS;
  }
}

export async function setSecurityPolicy(p: Partial<SecurityPolicy>): Promise<SecurityPolicy> {
  const entries: [string, string][] = [];
  if (p.passwordExpiryDays != null) entries.push([KEYS.exp, String(Math.max(0, Math.floor(p.passwordExpiryDays)))]);
  if (p.passwordGraceDays != null) entries.push([KEYS.grace, String(Math.max(0, Math.floor(p.passwordGraceDays)))]);
  if (p.mfaRequired != null) entries.push([KEYS.mfa, p.mfaRequired ? "true" : "false"]);
  for (const [key, value] of entries) {
    await prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  return getSecurityPolicy();
}

/** Evaluate a user's password against the expiry policy. */
export function passwordExpiry(passwordChangedAt: Date | null | undefined, policy: SecurityPolicy) {
  if (!policy.passwordExpiryDays || policy.passwordExpiryDays <= 0) {
    return { expired: false, canDefer: false, daysLeft: null as number | null };
  }
  const base = passwordChangedAt ? new Date(passwordChangedAt).getTime() : Date.now();
  const ageDays = (Date.now() - base) / 86400000;
  const daysLeft = Math.ceil(policy.passwordExpiryDays - ageDays);
  const expired = ageDays >= policy.passwordExpiryDays;
  const canDefer = expired ? (ageDays - policy.passwordExpiryDays) <= policy.passwordGraceDays : false;
  return { expired, canDefer, daysLeft };
}
