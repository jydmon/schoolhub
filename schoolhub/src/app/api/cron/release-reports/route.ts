import { releaseDueReports } from "@/lib/reports-release";
import { handleError, ok } from "@/lib/http";
import { NextResponse } from "next/server";

// Scheduled job: release every embargoed report batch whose release time has
// passed, and notify guardians. Idempotent — run it every minute from your
// scheduler (Vercel Cron, GitHub Actions, k8s CronJob, etc.).
//
// Auth: if CRON_SECRET is set, the caller must send it as a Bearer token
// (Authorization: Bearer <secret>) or an `x-cron-secret` header. In dev, with
// no secret configured, the endpoint is open.
function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  if (req.headers.get("x-cron-secret") === secret) return true;
  return false;
}

async function run(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const result = await releaseDueReports(new Date());
  return ok({ ok: true, ...result });
}

export async function POST(req: Request) {
  try { return await run(req); } catch (err) { return handleError(err); }
}

// GET is allowed too so schedulers that only issue GETs (e.g. Vercel Cron) work.
export async function GET(req: Request) {
  try { return await run(req); } catch (err) { return handleError(err); }
}
