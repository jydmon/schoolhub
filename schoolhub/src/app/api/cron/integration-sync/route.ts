import { prisma } from "@/lib/db";
import { runSync } from "@/lib/sync";
import { handleError, ok } from "@/lib/http";
import { NextResponse } from "next/server";

// Scheduled-synchronisation job. Runs enabled, scheduled connectors that are due.
// Auth: CRON_SECRET Bearer token (open in dev if unset). Idempotent; a connector
// with a run already in progress is skipped (no concurrent runs).
//
// NOTE: due-time evaluation here is coarse (any enabled connector whose
// syncFrequency is not "manual"); production would honour per-connector cron/
// interval. runSync currently simulates REST/SFTP transports (see src/lib/sync.ts).
function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}` || req.headers.get("x-cron-secret") === secret;
}

async function run(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const due = await prisma.integration.findMany({
    where: { enabled: true, method: { in: ["rest", "scheduled", "sftp"] }, syncFrequency: { not: "manual" } },
    select: { id: true },
  });
  const results: { integrationId: string; status: string }[] = [];
  for (const i of due) {
    const running = await prisma.syncRun.findFirst({ where: { integrationId: i.id, status: "running" } });
    if (running) { results.push({ integrationId: i.id, status: "skipped_running" }); continue; }
    try {
      const out = await runSync(i.id, { trigger: "scheduled" });
      results.push({ integrationId: i.id, status: out.status });
    } catch {
      results.push({ integrationId: i.id, status: "error" });
    }
  }
  return ok({ ok: true, ran: results.length, results });
}

export async function POST(req: Request) { try { return await run(req); } catch (err) { return handleError(err); } }
export async function GET(req: Request) { try { return await run(req); } catch (err) { return handleError(err); } }
