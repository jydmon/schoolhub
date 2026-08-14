import { prisma } from "./db";
import { currentImpersonatorId } from "./request-context";

export type AuditInput = {
  action: string;
  schoolId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown>;
  impersonatedBy?: string | null;
};

/**
 * Append an entry to the audit trail. Never throws into the caller's path —
 * an audit failure must not break the underlying operation, but it is logged.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        schoolId: input.schoolId ?? null,
        actorUserId: input.actorUserId ?? null,
        actorEmail: input.actorEmail ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        ip: input.ip ?? null,
        // Attribute to the impersonating admin when inside a support session.
        impersonatedBy: input.impersonatedBy ?? currentImpersonatorId() ?? null,
        metadata: JSON.stringify(input.metadata ?? {}),
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[audit] failed to record entry", input.action, err);
  }
}
