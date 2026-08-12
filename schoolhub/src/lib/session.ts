import { cookies, headers } from "next/headers";
import { prisma } from "./db";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
  verifySession,
} from "./auth";
import type { AuthContext } from "./rbac";

/** Read the current session and load the auth context.
 *  Web clients send the httpOnly session cookie; native (mobile) clients can't
 *  reliably persist/resend cookies, so they send the same signed JWT as an
 *  `Authorization: Bearer <token>` header. We accept either. */
export async function getAuthContext(): Promise<AuthContext | null> {
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

  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    isPlatformAdmin: user.isPlatformAdmin,
    memberships: user.memberships.map((m) => ({ schoolId: m.schoolId, role: m.role })),
  };
}

/** Issue a session cookie for a user. */
export function setSessionCookie(user: {
  id: string;
  email: string;
  isPlatformAdmin: boolean;
  sessionVersion?: number;
}) {
  const token = signSession({
    sub: user.id,
    email: user.email,
    isPlatformAdmin: user.isPlatformAdmin,
    ver: user.sessionVersion ?? 0,
  });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export function clearSessionCookie() {
  cookies().set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
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
