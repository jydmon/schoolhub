import { prisma } from "./db";

// Comprehensive support-ticket helpers layered on the existing SupportTicket
// model: human references, a 9-state lifecycle, SLA targets, escalation and
// reporting aggregation. Access control stays in lib/support.ts.

export const TICKET_STATUSES = [
  "open", "acknowledged", "assigned", "in_progress",
  "pending_user", "pending_third_party", "resolved", "closed", "reopened",
] as const;
export type TicketStatus = typeof TICKET_STATUSES[number];

export const STATUS_LABEL: Record<string, string> = {
  open: "Open", acknowledged: "Acknowledged", assigned: "Assigned", in_progress: "In Progress",
  pending_user: "Pending User", pending_third_party: "Pending Third-Party",
  resolved: "Resolved", closed: "Closed", reopened: "Reopened",
  // legacy value mapped for display
  waiting: "Pending User",
};

// Statuses that count as "the ticket is finished".
export const TERMINAL = new Set(["resolved", "closed"]);
// Statuses that pause the SLA clock (waiting on someone else).
const PAUSED = new Set(["pending_user", "pending_third_party", "resolved", "closed"]);

export const TICKET_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const PRIORITY_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical", normal: "Medium", urgent: "Critical" };
// SLA resolution target, in hours, by priority.
const SLA_HOURS: Record<string, number> = { critical: 4, high: 24, medium: 72, low: 120 };
export const normalizePriority = (p?: string) => (p === "normal" ? "medium" : p === "urgent" ? "critical" : (TICKET_PRIORITIES as readonly string[]).includes(p || "") ? p! : "medium");

export const TICKET_CATEGORIES: { key: string; label: string; subs: string[] }[] = [
  { key: "question", label: "Question", subs: ["How-to", "Account", "Billing", "Other"] },
  { key: "issue", label: "Issue / not working", subs: ["Login", "Data", "Performance", "Notifications", "Other"] },
  { key: "bug", label: "Report a bug", subs: ["Web app", "Mobile app", "Report/export", "Other"] },
  { key: "account", label: "Account & access", subs: ["Password", "Role/permissions", "New user", "Other"] },
  { key: "billing", label: "Billing", subs: ["Invoice", "Subscription", "Refund", "Other"] },
  { key: "other", label: "Other", subs: [] },
];

export function makeReference(id: string): string {
  return "SH-" + id.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase();
}

export function slaTarget(priority: string, from: Date): Date {
  const hours = SLA_HOURS[normalizePriority(priority)] ?? 72;
  return new Date(from.getTime() + hours * 3600 * 1000);
}

/** SLA health for a ticket, given now. Paused/terminal tickets never "breach". */
export function slaState(t: { status: string; slaDueAt: Date | string | null; resolvedAt: Date | string | null }, now = new Date()): { state: "ok" | "due_soon" | "breached" | "paused" | "met"; minutesLeft: number | null } {
  if (TERMINAL.has(t.status)) return { state: "met", minutesLeft: null };
  if (PAUSED.has(t.status)) return { state: "paused", minutesLeft: null };
  if (!t.slaDueAt) return { state: "ok", minutesLeft: null };
  const due = new Date(t.slaDueAt).getTime();
  const mins = Math.round((due - now.getTime()) / 60000);
  if (mins < 0) return { state: "breached", minutesLeft: mins };
  if (mins < 120) return { state: "due_soon", minutesLeft: mins };
  return { state: "ok", minutesLeft: mins };
}

/** Public shape of a ticket (extends the legacy ticketPublic with the new fields). */
export function serializeTicket(t: any, messageCount?: number) {
  const sla = slaState(t);
  return {
    id: t.id, reference: t.reference || makeReference(t.id), schoolId: t.schoolId,
    category: t.category, subcategory: t.subcategory || null, subject: t.subject,
    status: t.status, statusLabel: STATUS_LABEL[t.status] || t.status,
    priority: normalizePriority(t.priority), userName: t.userName, userEmail: t.userEmail,
    assignedToUserId: t.assignedToUserId || null,
    slaDueAt: t.slaDueAt || null, slaState: sla.state, slaMinutesLeft: sla.minutesLeft,
    acknowledgedAt: t.acknowledgedAt || null, firstResponseAt: t.firstResponseAt || null,
    resolvedAt: t.resolvedAt || null, closedAt: t.closedAt || null, escalated: !!t.escalated,
    createdAt: t.createdAt, updatedAt: t.updatedAt, messages: messageCount,
  };
}

/** Timestamps + flags to set when moving to a given status. */
export function statusTransition(to: string, ticket: any): any {
  const data: any = { status: to };
  const now = new Date();
  if (to === "acknowledged" && !ticket.acknowledgedAt) data.acknowledgedAt = now;
  if (to === "assigned" || to === "in_progress") { if (!ticket.acknowledgedAt) data.acknowledgedAt = now; }
  if (to === "resolved") data.resolvedAt = now;
  if (to === "closed") { data.closedAt = now; if (!ticket.resolvedAt) data.resolvedAt = now; }
  if (to === "reopened") { data.resolvedAt = null; data.closedAt = null; }
  return data;
}

/** Reporting aggregation over a set of tickets (already access-filtered). */
export async function ticketReport(where: any) {
  const tickets = await prisma.supportTicket.findMany({ where, orderBy: { updatedAt: "desc" }, take: 2000 });
  const now = new Date();
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const bySchool: Record<string, number> = {};
  const byAssignee: Record<string, number> = {};
  let openCount = 0, closedCount = 0, breached = 0, resolvedWithTime = 0, resolutionMsTotal = 0;

  for (const t of tickets) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    const pr = normalizePriority(t.priority); byPriority[pr] = (byPriority[pr] || 0) + 1;
    byCategory[t.category] = (byCategory[t.category] || 0) + 1;
    if (t.schoolId) bySchool[t.schoolId] = (bySchool[t.schoolId] || 0) + 1;
    if (t.assignedToUserId) byAssignee[t.assignedToUserId] = (byAssignee[t.assignedToUserId] || 0) + 1;
    if (TERMINAL.has(t.status)) closedCount++; else openCount++;
    if (slaState(t, now).state === "breached") breached++;
    if (t.resolvedAt) { resolvedWithTime++; resolutionMsTotal += (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()); }
  }
  const total = tickets.length;
  const slaTracked = tickets.filter((t) => !PAUSED.has(t.status) || TERMINAL.has(t.status)).length || total;
  return {
    total, open: openCount, closed: closedCount, breached,
    slaCompliance: slaTracked ? Math.round(((slaTracked - breached) / slaTracked) * 100) : 100,
    avgResolutionHours: resolvedWithTime ? Math.round((resolutionMsTotal / resolvedWithTime) / 3600000 * 10) / 10 : null,
    byStatus, byPriority, byCategory, bySchool, byAssignee,
  };
}
