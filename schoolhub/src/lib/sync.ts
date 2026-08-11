import { prisma } from "./db";
import { getConnector } from "./connectors";
import { runImport } from "./import";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";
import type { ImportType } from "./constants";

export type SyncTrigger = "manual" | "scheduled" | "webhook" | "csv";

export type SyncOutcome = {
  runId: string;
  status: "success" | "failed" | "partial";
  recordsIn: number;
  recordsUpdated: number;
  recordsFailed: number;
  message?: string;
  log: string[];
};

/**
 * Execute one synchronisation for an integration.
 *
 * - csv / manual methods with a CSV payload run through the Phase 2 import
 *   engine (the "CSV fallback integration").
 * - rest / scheduled / sftp methods are *simulated* in this scaffold: with no
 *   live credentials there is no external system to call, so the engine records
 *   a representative run. Set `config.simulateError = true` to exercise the
 *   failure + retry path; leave `config.baseUrl` empty to see a config error.
 * - webhook methods verify the inbound endpoint is ready (data actually arrives
 *   via POST /api/webhooks/{token}).
 *
 * Source-of-truth is respected by the caller: SchoolHub only writes back to an
 * external system when that integration has writeBackEnabled.
 */
export async function runSync(
  integrationId: string,
  opts: { trigger: SyncTrigger; csvText?: string; importType?: ImportType; actorUserId?: string; actorEmail?: string }
): Promise<SyncOutcome> {
  const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
  if (!integration) throw new Error("Integration not found");
  const connector = getConnector(integration.connectorKey);
  const log: string[] = [];
  const stamp = (msg: string) => log.push(`${new Date().toISOString()}  ${msg}`);

  stamp(`Sync started (trigger=${opts.trigger}, method=${integration.method}, connector=${integration.connectorKey})`);

  const run = await prisma.syncRun.create({
    data: { integrationId, schoolId: integration.schoolId, trigger: opts.trigger, status: "running" },
  });

  let status: SyncOutcome["status"] = "success";
  let recordsIn = 0;
  let recordsUpdated = 0;
  let recordsFailed = 0;
  let message: string | undefined;

  try {
    if (integration.enabled === false || integration.status === "disabled") {
      throw new Error("Integration is disabled");
    }
    const cfg = safeJson(integration.config);

    if (integration.method === "csv" || integration.method === "manual") {
      if (!opts.csvText) throw new Error("No file supplied for this manual/CSV run");
      const type = (opts.importType || "students") as ImportType;
      stamp(`Parsing CSV and mapping ${type} via ${connector?.name ?? integration.connectorKey}`);
      const res = await runImport({
        schoolId: integration.schoolId,
        type,
        csvText: opts.csvText,
        filename: `${integration.connectorKey}.csv`,
        actorUserId: opts.actorUserId,
        actorEmail: opts.actorEmail,
      });
      recordsIn = res.totalRows;
      recordsUpdated = res.createdRows + res.updatedRows;
      recordsFailed = res.errorRows;
      status = res.status === "failed" ? "failed" : res.errorRows > 0 ? "partial" : "success";
      stamp(`Import result: ${res.createdRows} created, ${res.updatedRows} updated, ${res.errorRows} errored`);
      if (status === "failed") message = "All rows failed validation";
    } else if (integration.method === "webhook") {
      stamp(`Webhook endpoint ready at /api/webhooks/${integration.webhookToken ?? "<token>"}`);
      stamp("Inbound events are ingested as they arrive; nothing to pull.");
      recordsIn = 0;
    } else {
      // rest | scheduled | sftp — simulated pull
      if (cfg.simulateError) throw new Error("Upstream returned 500 (config.simulateError is set)");
      if (integration.method === "sftp") {
        if (!cfg.host) throw new Error("SFTP not configured: set config.host and config.path");
        stamp(`Connecting to sftp://${cfg.host}${cfg.path ?? "/"}`);
      } else {
        if (!cfg.baseUrl) throw new Error("Connection not configured: set config.baseUrl and credentials");
        stamp(`GET ${cfg.baseUrl} (${integration.method})`);
      }
      // Representative counts based on the current roll (no live source in scaffold).
      const n = await prisma.student.count({ where: { schoolId: integration.schoolId } });
      recordsIn = n;
      recordsUpdated = Math.max(0, Math.floor(n / 2));
      stamp(`Pulled ${recordsIn} record(s); ${recordsUpdated} changed. (simulated — connect live credentials to sync real data)`);
      status = "success";
    }
  } catch (err) {
    status = "failed";
    message = (err as Error).message;
    stamp(`ERROR: ${message}`);
  }

  const finishedAt = new Date();
  await prisma.syncRun.update({
    where: { id: run.id },
    data: { status, finishedAt, recordsIn, recordsUpdated, recordsFailed, message, log: JSON.stringify(log) },
  });

  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      lastSyncAt: finishedAt,
      ...(status === "success" || status === "partial"
        ? { lastSuccessAt: finishedAt, status: "connected", lastError: null }
        : { status: "error", lastError: message ?? "Sync failed" }),
    },
  });

  await recordAudit({
    action: AUDIT.INTEGRATION_ACTIVITY,
    schoolId: integration.schoolId,
    actorUserId: opts.actorUserId,
    actorEmail: opts.actorEmail,
    targetType: "Integration",
    targetId: integrationId,
    metadata: { trigger: opts.trigger, status, recordsIn, recordsUpdated, recordsFailed },
  });

  return { runId: run.id, status, recordsIn, recordsUpdated, recordsFailed, message, log };
}

function safeJson(s: string): Record<string, any> {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}
