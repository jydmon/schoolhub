import { cookies, headers } from "next/headers";
import { prisma } from "./db";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  SESSION_TTL_REMEMBER,
  IMPERSONATION_COOKIE,
  signSession,
  verifySession,
  verifyImpersonation,
} from "./auth";
import type { AuthContext } from "./rbac";
import { resolveEffectivePermissions } from "./roles";

// Item 12: preload tenant role customizations into permsBySchool. Guarded so a
// missing TenantRole table (pre-migration) simply yields built-in defaults.
async function loadPermsBySchool(memberships: { schoolId: string; role: string }[]): Promise<Record<string, string[]> | undefined> {
  try {
    const schoolIds = Array.from(new Set(memberships.map((m) => m.schoolId)));
    if (!schoolIds.length) return undefined;
    const rows = await prisma.tenantRole.findMany({ where: { schoolId: { in: schoolIds } } });
    if (!rows.length) return undefined;
    const bySchool: Record<string, string[]> = {};
    for (const sid of schoolIds) {
      const srows = rows.filter((r) => r.schoolId === sid);
      if (!srows.length) continue;
      const roleKeys = memberships.filter((m) => m.schoolId === sid).map((m) => m.role);
      bySchool[sid] = resolveEffectivePermissions(roleKeys, srows);
    }
    return Object.keys(bySchool).length ? bySchool : undefined;
  } catch { return undefined; }
}

/** Read the current session and load the auth context.
 *  Web clients send the httpOnly session cookie; native (mobile) clients can't
 *  reliably persist/resend cookies, so they send the same signed JWT as an
 *  `Authorization: Bearer <token>` header. We accept either. */
export async function getAuthContext(): Promise<AuthContext | null> {
  // Support-access impersonation (item 13). Fully guarded: if anything is off
  // we fall through to the admin's own session below, so normal auth is never
  // affected. Only activates when a valid impersonation cookie is present.
  try {
    const impTok = cookies().get(IMPERSONATION_COOKIE)?.value;
    if (impTok) {
      const imp = verifyImpersonation(impTok);
      if (imp) {
        const req = await prisma.supportAccessRequest.findUnique({ where: { id: imp.rid } });
        const okWindow = req && req.status === "active" && req.targetUserId === imp.sub && req.requesterId === imp.by && (!req.expiresAt || new Date(req.expiresAt).getTime() > Date.now());
        if (okWindow) {
          const admin = await prisma.user.findUnique({ where: { id: imp.by }, select: { isPlatformAdmin: true, status: true } });
          const tuser = await prisma.user.findUnique({ where: { id: imp.sub }, include: { memberships: true } });
          if (admin?.isPlatformAdmin && admin.status !== "suspended" && tuser && tuser.status !== "suspended") {
            return {
              userId: tuser.id, email: tuser.email, fullName: tuser.fullName, isPlatformAdmin: tuser.isPlatformAdmin,
              memberships: tuser.memberships.map((m) => ({ schoolId: m.schoolId, role: m.role })),
              impersonatorId: imp.by, impersonationRequestId: imp.rid,
            };
          }
        }
      }
    }
  } catch { /* ignore — revert to the admin's own session */ }

  let token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) {
    const auth = headers().get("authorization") || headers().get("Authorization");
    if (auth && auth.toLowerCase().startsWith("bearer ")) token = auth.slice(7).trim();
  }
  if (!token) return null;
  const claims = verifySession(token);
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    include: { memberships: true },
  });
  if (!user || user.status === "suspended") return null;
  // Session revocation: a bumped sessionVersion invalidates old tokens.
  if ((claims.ver ?? 0) !== user.sessionVersion) return null;

  const memberships = user.memberships.map((m) => ({ schoolId: m.schoolId, role: m.role }));
  const permsBySchool = await loadPermsBySchool(memberships);
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    isPlatformAdmin: user.isPlatformAdmin,
    memberships,
    ...(permsBySchool ? { permsBySchool } : {}),
  };
}

/** Issue a session cookie for a user. `remember` extends the lifetime for
 *  "Keep me logged in" on trusted devices. */
export function setSessionCookie(user: {
  id: string;
  email: string;
  isPlatformAdmin: boolean;
  sessionVersion?: number;
}, remember = false) {
  const ttl = remember ? SESSION_TTL_REMEMBER : SESSION_MAX_AGE;
  const token = signSession({
    sub: user.id,
    email: user.email,
    isPlatformAdmin: user.isPlatformAdmin,
    ver: user.sessionVersion ?? 0,
  }, ttl);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttl,
  });
}

export function clearSessionCookie() {
  cookies().set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

// ---- Support-access impersonation cookie (item 13) ----
export function setImpersonationCookie(token: string, ttlSeconds: number) {
  cookies().set(IMPERSONATION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: ttlSeconds });
}
export function clearImpersonationCookie() {
  cookies().set(IMPERSONATION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export class AuthError extends Error {
  status = 401;
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "AuthError";
  }
}

/** Throw AuthError if there is no session. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthError();
  return ctx;
}

/** Throw if the caller is not a platform super administrator. */
export async function requirePlatformAdmin(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!ctx.isPlatformAdmin) throw new AuthError("Platform administrator required");
  return ctx;
}
