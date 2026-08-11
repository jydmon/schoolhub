/*
 * Create (or promote) the platform super administrator — WITHOUT any demo data.
 * Run against your production database, e.g.:
 *
 *   ADMIN_EMAIL="you@yourdomain.com" ADMIN_PASSWORD="a-strong-password" \
 *   ADMIN_NAME="Your Name" npx tsx scripts/create-admin.ts
 *
 * Safe to re-run: it upserts by email and (re)sets the password you supply.
 */
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";

async function main() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const fullName = process.env.ADMIN_NAME || "Platform Administrator";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Set ADMIN_EMAIL to a valid email");
  if (password.length < 10) throw new Error("Set ADMIN_PASSWORD to at least 10 characters");

  const user = await prisma.user.upsert({
    where: { email },
    update: { isPlatformAdmin: true, status: "active", emailVerified: true, passwordHash: await hashPassword(password), fullName },
    create: { email, fullName, passwordHash: await hashPassword(password), isPlatformAdmin: true, status: "active", emailVerified: true },
  });
  console.log("✔ Platform super admin ready:", user.email);
}
main().then(() => process.exit(0)).catch((e) => { console.error("ERROR: " + (e?.message || e)); process.exit(1); });
