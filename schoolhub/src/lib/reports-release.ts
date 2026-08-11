import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AppError } from "./http";
import { AUDIT, PUPIL_REPORT_LABELS } from "./constants";
import { dispatch } from "./notify";

// Pupil-report release engine. Reports move through a lifecycle:
//
//   draft → submitted → approved → scheduled → released
//                                    └────────→ released (release_now)
//   (any) → withdrawn
//
// Parents may only see a report once it is *effectively released*: status
// "released", or "scheduled" with an embargo (`releaseAt`) that has passed. The
// batch (ReportRelease) carries the approval + embargo so a whole year group is
// signed off and timed as a unit; each child StudentReport mirrors the batch's
// status/releaseAt so parent-facing reads never have to join the batch.
//
// Release fans a notification out through the existing notification centre
// (`dispatch`), so per-parent channel preferences, quiet hours and delivery
// tracking all apply — and report alerts show up in the messaging delivery
// report alongside everything else.

export type ReportItemInput = {
  studentId: string;
  type?: string;
  title?: string;
  term?: string;
  summary?: string;
  body?: Record<string, any>;
  fileUrl?: string;
};

type Actor = { userId?: string; email?: string } | undefined;

const DEFAULT_NOTIFY = "inapp,push,email";

function reportTitleFor(type: string, student: { firstName: string; lastName: string }): string {
  return `${PUPIL_REPORT_LABELS[type] || "Report"} — ${student.firstName} ${student.lastName}`;
}

/** Create StudentReport rows under a release (or standalone if releaseId is null). */
export async function addReports(opts: {
  schoolId: string;
  releaseId: string | null;
  releaseType: string;
  releaseTerm?: string | null;
  authorId?: string;
  items: ReportItemInput[];
}): Promise<{ added: number; skipped: number; errors: { studentId: string; message: string }[] }> {
  const errors: { studentId: string; message: string }[] = [];
  let added = 0;
  let skipped = 0;

  for (const it of opts.items) {
    const student = await prisma.student.findFirst({
      where: { id: it.studentId, schoolId: opts.schoolId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!student) {
      errors.push({ studentId: it.studentId, message: "student not found in this school" });
      continue;
    }
    // One report per (release, student) to avoid accidental duplicates.
    if (opts.releaseId) {
      const dupe = await prisma.studentReport.findFirst({
        where: { releaseId: opts.releaseId, studentId: it.studentId },
        select: { id: true },
      });
      if (dupe) { skipped++; continue; }
    }
    const type = it.type || opts.releaseType;
    await prisma.studentReport.create({
      data: {
        schoolId: opts.schoolId,
        releaseId: opts.releaseId,
        studentId: it.studentId,
        type,
        title: it.title || reportTitleFor(type, student),
        term: it.term || opts.releaseTerm || null,
        summary: it.summary || null,
        bodyJson: JSON.stringify(it.body || {}),
        fileUrl: it.fileUrl || null,
        status: "draft",
        authorId: opts.authorId || null,
      },
    });
    added++;
  }
  return { added, skipped, errors };
}

/** Create a release, optionally seeding its reports. */
export async function createRelease(opts: {
  schoolId: string;
  name: string;
  type: string;
  term?: string;
  notifyChannels?: string[];
  reports?: ReportItemInput[];
  actor: Actor;
}) {
  const release = await prisma.reportRelease.create({
    data: {
      schoolId: opts.schoolId,
      name: opts.name,
      type: opts.type,
      term: opts.term || null,
      status: "draft",
      notifyChannels: opts.notifyChannels?.length ? opts.notifyChannels.join(",") : DEFAULT_NOTIFY,
      createdById: opts.actor?.userId || null,
    },
  });
  let seeded = { added: 0, skipped: 0, errors: [] as { studentId: string; message: string }[] };
  if (opts.reports?.length) {
    seeded = await addReports({
      schoolId: opts.schoolId,
      releaseId: release.id,
      releaseType: opts.type,
      releaseTerm: opts.term,
      authorId: opts.actor?.userId,
      items: opts.reports,
    });
  }
  await recordAudit({
    action: AUDIT.REPORT_DRAFTED,
    schoolId: opts.schoolId,
    actorUserId: opts.actor?.userId,
    actorEmail: opts.actor?.email,
    targetType: "ReportRelease",
    targetId: release.id,
    metadata: { name: opts.name, type: opts.type, seeded: seeded.added },
  });
  return { release, seeded };
}

// ---- lifecycle -------------------------------------------------------------

const ALLOWED: Record<string, string[]> = {
  submit: ["draft", "submitted"],
  approve: ["submitted"],
  schedule: ["approved", "scheduled"],
  release_now: ["approved", "scheduled"],
  withdraw: ["draft", "submitted", "approved", "scheduled", "released"],
};

/** Notify the guardians of a set of students that reports are available. */
async function notifyGuardians(
  schoolId: string,
  studentIds: string[],
  channels: string,
  title: string,
  body: string,
  targeting: Record<string, unknown>,
  actor: Actor
): Promise<string | null> {
  if (studentIds.length === 0) return null;
  const links = await prisma.guardianLink.findMany({
    where: { studentId: { in: studentIds } },
    select: { parentUserId: true },
  });
  const userIds = Array.from(new Set(links.map((l) => l.parentUserId)));
  if (userIds.length === 0) return null;

  const message = await prisma.message.create({
    data: {
      schoolId,
      senderUserId: actor?.userId || null,
      title,
      body,
      channels,
      priority: "normal",
      targeting: JSON.stringify(targeting),
    },
  });
  await dispatch({ id: message.id, schoolId, title, body, channels, priority: "normal" }, userIds);
  return message.id;
}

/** Flip a release (and its child reports) to released, and notify guardians. */
async function doRelease(
  release: { id: string; schoolId: string; type: string; name: string; notifyChannels: string },
  now: Date,
  actor: Actor
) {
  await prisma.studentReport.updateMany({
    where: { releaseId: release.id, status: { in: ["approved", "scheduled"] } },
    data: { status: "released", releasedAt: now },
  });
  const reports = await prisma.studentReport.findMany({
    where: { releaseId: release.id, status: "released" },
    select: { studentId: true },
  });
  const studentIds = Array.from(new Set(reports.map((r) => r.studentId)));

  const title = `${PUPIL_REPORT_LABELS[release.type] || "School report"} now available`;
  const body = `${release.name} has been released. Open Reports in the app or portal to view your child's report.`;
  const messageId = await notifyGuardians(
    release.schoolId,
    studentIds,
    release.notifyChannels || DEFAULT_NOTIFY,
    title,
    body,
    { kind: "report_release", releaseId: release.id },
    actor
  );

  await prisma.reportRelease.update({
    where: { id: release.id },
    data: { status: "released", releasedAt: now, messageId: messageId ?? undefined },
  });

  await recordAudit({
    action: AUDIT.REPORT_RELEASED,
    schoolId: release.schoolId,
    actorUserId: actor?.userId,
    actorEmail: actor?.email,
    targetType: "ReportRelease",
    targetId: release.id,
    metadata: { students: studentIds.length, channels: release.notifyChannels, messageId },
  });
  return { students: studentIds.length, messageId };
}

/** Apply a lifecycle transition to a release. */
export async function transitionRelease(opts: {
  schoolId: string;
  releaseId: string;
  action: "submit" | "approve" | "schedule" | "release_now" | "withdraw";
  releaseAt?: string;
  notifyChannels?: string[];
  actor: Actor;
  now?: Date;
}) {
  const now = opts.now || new Date();
  const release = await prisma.reportRelease.findFirst({
    where: { id: opts.releaseId, schoolId: opts.schoolId },
  });
  if (!release) throw new AppError("Report release not found", 404);

  const allowedFrom = ALLOWED[opts.action];
  if (!allowedFrom.includes(release.status)) {
    throw new AppError(`Cannot ${opts.action.replace("_", " ")} a release that is "${release.status}".`, 409);
  }

  // Persist an updated notify-channel choice whenever supplied.
  const channels = opts.notifyChannels?.length ? opts.notifyChannels.join(",") : release.notifyChannels;

  if (opts.action === "submit") {
    await prisma.reportRelease.update({ where: { id: release.id }, data: { status: "submitted" } });
    await prisma.studentReport.updateMany({
      where: { releaseId: release.id, status: { in: ["draft", "submitted"] } },
      data: { status: "submitted" },
    });
    await recordAudit({ action: AUDIT.REPORT_SUBMITTED, schoolId: opts.schoolId, actorUserId: opts.actor?.userId, actorEmail: opts.actor?.email, targetType: "ReportRelease", targetId: release.id, metadata: {} });
    return { status: "submitted" };
  }

  if (opts.action === "withdraw") {
    await prisma.reportRelease.update({ where: { id: release.id }, data: { status: "withdrawn" } });
    await prisma.studentReport.updateMany({ where: { releaseId: release.id }, data: { status: "withdrawn" } });
    await recordAudit({ action: AUDIT.REPORT_WITHDRAWN, schoolId: opts.schoolId, actorUserId: opts.actor?.userId, actorEmail: opts.actor?.email, targetType: "ReportRelease", targetId: release.id, metadata: { from: release.status } });
    return { status: "withdrawn" };
  }

  if (opts.action === "approve") {
    // Approve, then optionally schedule (future) or release immediately (past) if
    // a releaseAt was supplied in the same call.
    await prisma.reportRelease.update({
      where: { id: release.id },
      data: { status: "approved", approvedById: opts.actor?.userId || null, approvedAt: now, notifyChannels: channels },
    });
    await prisma.studentReport.updateMany({
      where: { releaseId: release.id, status: { in: ["draft", "submitted", "approved"] } },
      data: { status: "approved", approvedById: opts.actor?.userId || null, approvedAt: now },
    });
    await recordAudit({ action: AUDIT.REPORT_APPROVED, schoolId: opts.schoolId, actorUserId: opts.actor?.userId, actorEmail: opts.actor?.email, targetType: "ReportRelease", targetId: release.id, metadata: {} });

    if (opts.releaseAt) {
      return scheduleOrRelease(release.id, opts.schoolId, new Date(opts.releaseAt), channels, opts.actor, now);
    }
    return { status: "approved" };
  }

  if (opts.action === "schedule") {
    if (!opts.releaseAt) throw new AppError("A release date/time is required to schedule.", 400);
    return scheduleOrRelease(release.id, opts.schoolId, new Date(opts.releaseAt), channels, opts.actor, now);
  }

  // release_now
  const fresh = await prisma.reportRelease.update({
    where: { id: release.id },
    data: { notifyChannels: channels },
  });
  const res = await doRelease(fresh, now, opts.actor);
  return { status: "released", ...res };
}

/** Set an embargo; if it is already in the past, release immediately. */
async function scheduleOrRelease(
  releaseId: string,
  schoolId: string,
  releaseAt: Date,
  channels: string,
  actor: Actor,
  now: Date
) {
  if (isNaN(releaseAt.getTime())) throw new AppError("Invalid release date/time.", 400);

  if (releaseAt.getTime() <= now.getTime()) {
    const rel = await prisma.reportRelease.update({ where: { id: releaseId }, data: { releaseAt, notifyChannels: channels } });
    const res = await doRelease(rel, now, actor);
    return { status: "released", ...res };
  }

  await prisma.reportRelease.update({
    where: { id: releaseId },
    data: { status: "scheduled", releaseAt, notifyChannels: channels },
  });
  await prisma.studentReport.updateMany({
    where: { releaseId, status: { in: ["approved", "scheduled"] } },
    data: { status: "scheduled", releaseAt },
  });
  await recordAudit({ action: AUDIT.REPORT_SCHEDULED, schoolId, actorUserId: actor?.userId, actorEmail: actor?.email, targetType: "ReportRelease", targetId: releaseId, metadata: { releaseAt: releaseAt.toISOString() } });
  return { status: "scheduled", releaseAt: releaseAt.toISOString() };
}

/**
 * Cron entrypoint: release every scheduled batch whose embargo has passed, and
 * any standalone scheduled reports. Idempotent — safe to run every minute.
 */
export async function releaseDueReports(now = new Date()) {
  const dueReleases = await prisma.reportRelease.findMany({
    where: { status: "scheduled", releaseAt: { lte: now } },
  });
  let releasesReleased = 0;
  let studentsNotified = 0;
  for (const r of dueReleases) {
    const res = await doRelease(r, now, undefined);
    releasesReleased++;
    studentsNotified += res.students;
  }

  // Standalone reports (not part of a batch) with a passed embargo.
  const dueStandalone = await prisma.studentReport.findMany({
    where: { releaseId: null, status: "scheduled", releaseAt: { lte: now } },
  });
  for (const sr of dueStandalone) {
    await prisma.studentReport.update({ where: { id: sr.id }, data: { status: "released", releasedAt: now } });
    await notifyGuardians(
      sr.schoolId,
      [sr.studentId],
      DEFAULT_NOTIFY,
      `${PUPIL_REPORT_LABELS[sr.type] || "School report"} now available`,
      `${sr.title} has been released. Open Reports to view it.`,
      { kind: "report_release", reportId: sr.id },
      undefined
    );
    await recordAudit({ action: AUDIT.REPORT_RELEASED, schoolId: sr.schoolId, targetType: "StudentReport", targetId: sr.id, metadata: { standalone: true } });
  }

  return { releasesReleased, standaloneReleased: dueStandalone.length, studentsNotified };
}

// ---- reads -----------------------------------------------------------------

/** Full release with its reports, for the school/SLT view. */
export async function getReleaseDetail(schoolId: string, releaseId: string) {
  const release = await prisma.reportRelease.findFirst({
    where: { id: releaseId, schoolId },
    include: {
      createdBy: { select: { fullName: true, email: true } },
      approvedBy: { select: { fullName: true, email: true } },
      reports: {
        orderBy: { createdAt: "asc" },
        include: { student: { select: { id: true, firstName: true, lastName: true, yearGroup: true } } },
      },
    },
  });
  if (!release) throw new AppError("Report release not found", 404);
  return release;
}

/** Guardian-visible reports across all of a parent's children. */
export async function parentReports(userId: string, now = new Date()) {
  const links = await prisma.guardianLink.findMany({ where: { parentUserId: userId }, select: { studentId: true } });
  const studentIds = Array.from(new Set(links.map((l) => l.studentId)));
  if (studentIds.length === 0) return [];

  const reports = await prisma.studentReport.findMany({
    where: {
      studentId: { in: studentIds },
      OR: [{ status: "released" }, { status: "scheduled", releaseAt: { lte: now } }],
    },
    orderBy: [{ releasedAt: "desc" }, { releaseAt: "desc" }, { createdAt: "desc" }],
    include: { student: { select: { id: true, firstName: true, lastName: true, preferredName: true } } },
  });
  return reports.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    term: r.term,
    summary: r.summary,
    hasFile: !!r.fileUrl,
    releasedAt: r.releasedAt || r.releaseAt,
    viewed: !!r.firstViewedAt,
    student: r.student,
  }));
}

/** One report for a parent — enforces guardianship + visibility, records a view. */
export async function parentReportDetail(userId: string, reportId: string, actorEmail?: string, now = new Date()) {
  const report = await prisma.studentReport.findUnique({
    where: { id: reportId },
    include: { student: { select: { id: true, firstName: true, lastName: true, preferredName: true, yearGroup: true } } },
  });
  if (!report) throw new AppError("Report not found", 404);

  const link = await prisma.guardianLink.findFirst({
    where: { parentUserId: userId, studentId: report.studentId },
    select: { id: true },
  });
  if (!link) throw new AppError("You do not have access to this report", 403);

  const visible = report.status === "released" || (report.status === "scheduled" && report.releaseAt != null && report.releaseAt.getTime() <= now.getTime());
  if (!visible) throw new AppError("This report is not available yet", 403);

  if (!report.firstViewedAt) {
    await prisma.studentReport.update({ where: { id: report.id }, data: { firstViewedAt: now } });
    await recordAudit({ action: AUDIT.REPORT_VIEWED, schoolId: report.schoolId, actorUserId: userId, actorEmail, targetType: "StudentReport", targetId: report.id, metadata: { studentId: report.studentId } });
  }

  let body: any = {};
  try { body = JSON.parse(report.bodyJson); } catch { body = {}; }
  return {
    id: report.id,
    type: report.type,
    title: report.title,
    term: report.term,
    summary: report.summary,
    body,
    fileUrl: report.fileUrl,
    releasedAt: report.releasedAt || report.releaseAt,
    student: report.student,
  };
}
