import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes, randomUUID } from "crypto";
import { prisma } from "./db";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-only-change-me";
const SESSION_TTL = parseInt(process.env.SESSION_TTL_SECONDS ?? "28800", 10);
// "Keep me logged in" — a longer session on trusted devices (default 30 days).
const SESSION_TTL_REMEMBER = parseInt(process.env.SESSION_TTL_REMEMBER_SECONDS ?? String(30 * 86400), 10);

export const SESSION_COOKIE = "schoolhub_session";

// ---- Passwords ----

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ---- Session JWTs ----

export type SessionClaims = {
  sub: string; // user id
  email: string;
  isPlatformAdmin: boolean;
  ver: number; // session version — must match the user's current sessionVersion
};

export function signSession(claims: SessionClaims, ttlSeconds: number = SESSION_TTL): string {
  return jwt.sign(claims, JWT_SECRET, { expiresIn: ttlSeconds });
}

export function verifySession(token: string): SessionClaims | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    if (!decoded.sub || typeof decoded.email !== "string") return null;
    return {
      sub: String(decoded.sub),
      email: decoded.email,
      isPlatformAdmin: Boolean(decoded.isPlatformAdmin),
      ver: typeof decoded.ver === "number" ? decoded.ver : 0,
    };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = SESSION_TTL;
export { SESSION_TTL, SESSION_TTL_REMEMBER };

// ---- One-time tokens (email verification / password reset) ----

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createVerificationToken(
  userId: string,
  type: "email_verify" | "password_reset",
  ttlMinutes = 60
) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  await prisma.verificationToken.create({
    data: { id: randomUUID(), userId, token, type, expiresAt },
  });
  return token;
}

export async function consumeVerificationToken(
  token: string,
  type: "email_verify" | "password_reset"
) {
  const row = await prisma.verificationToken.findUnique({ where: { token } });
  if (!row || row.type !== type) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  await prisma.verificationToken.update({
    where: { token },
    data: { usedAt: new Date() },
  });
  return row;
}
