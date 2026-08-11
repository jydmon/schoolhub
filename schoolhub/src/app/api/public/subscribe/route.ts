import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { subscribeSchema } from "@/lib/validation";
import { captureContact } from "@/lib/crm";
import { rateLimit } from "@/lib/ratelimit";
import { handleError, clientIp, ok } from "@/lib/http";

// Origins allowed to POST this public form cross-site. The marketing site
// (siplat.com) is served on a different host than the app (dev.siplat.com), so
// the browser sends a CORS preflight. Set MARKETING_ORIGIN in the app's env to a
// comma-separated allowlist; defaults cover the apex + www marketing domain.
const ALLOWED_ORIGINS = (process.env.MARKETING_ORIGIN || "https://siplat.com,https://www.siplat.com")
  .split(",").map((s) => s.trim()).filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// CORS preflight.
export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

// Public website "Subscribe now" capture — no auth. Feeds the CRM. Rate-limited
// per IP to deter abuse. Always responds 200 with { ok } so the form can't be
// used to probe which emails already exist.
export async function POST(req: Request) {
  const cors = corsHeaders(req);
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`subscribe:${ip ?? "anon"}`, 10, 60_000);
    if (!rl.ok) return ok({ ok: true }, 200, cors); // silently drop; don't leak rate state

    const body = subscribeSchema.parse(await req.json());
    let schoolId: string | null = null;
    if (body.schoolSlug) {
      const school = await prisma.school.findUnique({ where: { slug: body.schoolSlug }, select: { id: true } });
      schoolId = school?.id ?? null;
    }
    await captureContact({
      email: body.email,
      name: body.name,
      phone: body.phone,
      interest: body.interest,
      audience: "subscriber",
      source: body.source ?? "website",
      schoolId,
      consent: body.consent ?? true,
    });
    return ok({ ok: true, message: "Thanks — you're subscribed." }, 200, cors);
  } catch (err) {
    const res = handleError(err);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  }
}
