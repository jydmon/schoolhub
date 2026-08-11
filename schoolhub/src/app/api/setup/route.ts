import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

// One-time, browser-only bootstrap of the FIRST platform super admin — for
// no-terminal deploys (e.g. Vercel). Safe by construction:
//   • It refuses forever once ANY platform admin exists (self-closing).
//   • Until then it requires a secret token (?token=SETUP_SECRET) that only the
//     deployer knows (set as an env var).
// After you've created your admin, delete SETUP_SECRET and ADMIN_PASSWORD from
// your environment variables. Visit:  https://YOUR-APP/api/setup?token=YOUR_SECRET
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Closed permanently once an admin exists.
  const existing = await prisma.user.count({ where: { isPlatformAdmin: true } });
  if (existing > 0) {
    return NextResponse.json({ ok: false, message: "Setup already completed — an administrator already exists." }, { status: 403 });
  }

  const secret = process.env.SETUP_SECRET || "";
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!secret || token !== secret) {
    return NextResponse.json({ ok: false, message: "Invalid or missing setup token." }, { status: 401 });
  }

  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const fullName = process.env.ADMIN_NAME || "Platform Administrator";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, message: "Set ADMIN_EMAIL to a valid email address in your environment variables." }, { status: 400 });
  }
  if (password.length < 10) {
    return NextResponse.json({ ok: false, message: "Set ADMIN_PASSWORD (at least 10 characters) in your environment variables." }, { status: 400 });
  }

  const user = await prisma.user.create({
    data: { email, fullName, passwordHash: await hashPassword(password), isPlatformAdmin: true, status: "active", emailVerified: true },
  });

  return NextResponse.json({
    ok: true,
    message: `Platform administrator created: ${user.email}. You can now sign in at /login. IMPORTANT: delete the SETUP_SECRET and ADMIN_PASSWORD environment variables now — this page is already closed.`,
  });
}
