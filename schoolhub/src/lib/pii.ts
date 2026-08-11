import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";
import { validateGrant, type UnmaskGrant } from "./pii-logic";

// Field-level encryption for pupil PII (names, DOB, contact, address) plus the
// tenant-admin "unmask grant" workflow. PII is encrypted at rest with AES-256-
// GCM under a DEDICATED key (PII_ENC_KEY) — separate from the integration vault
// key — and is only ever decrypted for authorised in-tenant viewers, or for a
// platform staff member holding a live PiiUnmaskGrant. Masking rules live in
// pii-logic.ts.

const VERSION = "p1";
function key(): Buffer {
  const env = process.env.PII_ENC_KEY;
  if (env && /^[0-9a-fA-F]{64}$/.test(env)) return Buffer.from(env, "hex");
  if (env && env.length) return scryptSync(env, "siplat-pii", 32);
  return scryptSync(process.env.JWT_SECRET || "dev-only-change-me", "siplat-pii-dev", 32);
}

export function encryptPII(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}
export function decryptPII(blob: string): string {
  const p = blob.split(":");
  if (p.length !== 4 || p[0] !== VERSION) throw new Error("Malformed PII ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(p[1], "base64"));
  decipher.setAuthTag(Buffer.from(p[2], "base64"));
  return Buffer.concat([decipher.update(Buffer.from(p[3], "base64")), decipher.final()]).toString("utf8");
}

/** Tenant admin grants a platform staff member time-boxed PII access. */
export async function createUnmaskGrant(input: { schoolId: string; grantedToUserId: string; grantedByUserId: string; ttlMinutes?: number; scope?: string; reason?: string }): Promise<{ id: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + (input.ttlMinutes ?? 60) * 60_000);
  const check = validateGrant({ schoolId: input.schoolId, grantedToUserId: input.grantedToUserId, expiresAt });
  if (!check.ok) throw new Error(check.reason);
  const g = await prisma.piiUnmaskGrant.create({
    data: { schoolId: input.schoolId, grantedToUserId: input.grantedToUserId, grantedByUserId: input.grantedByUserId, scope: input.scope ?? null, reason: input.reason ?? null, expiresAt },
  });
  await recordAudit({ action: AUDIT.PII_GRANT_CREATED, schoolId: input.schoolId, actorUserId: input.grantedByUserId, targetType: "PiiUnmaskGrant", targetId: g.id, metadata: { grantee: input.grantedToUserId, expiresAt } });
  return { id: g.id, expiresAt };
}

export async function revokeUnmaskGrant(id: string, actorUserId?: string | null): Promise<void> {
  const g = await prisma.piiUnmaskGrant.update({ where: { id }, data: { revokedAt: new Date() } });
  await recordAudit({ action: AUDIT.PII_GRANT_REVOKED, schoolId: g.schoolId, actorUserId, targetType: "PiiUnmaskGrant", targetId: id });
}

/** The live grant (if any) letting `userId` see PII for `schoolId` right now. */
export async function activeGrant(schoolId: string, userId: string): Promise<UnmaskGrant | null> {
  const g = await prisma.piiUnmaskGrant.findFirst({
    where: { schoolId, grantedToUserId: userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: "desc" },
  });
  return g ? { schoolId: g.schoolId, grantedByUserId: g.grantedByUserId, grantedToUserId: g.grantedToUserId, expiresAt: g.expiresAt, scope: g.scope ?? undefined } : null;
}
