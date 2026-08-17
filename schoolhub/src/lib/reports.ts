import { prisma } from "./db";
import { todayStr } from "./transport";
import { sheetsToXls, type Sheet } from "./xls";

const dayStr = (offset: number) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// -------------------------------------------------------------------- dashboard

export async function opsDashboard(schoolId: string) {
  const today = todayStr();
  const [enrolled, todayJourneys, activeTrips, residentialTrips, eventsToday, integrations] = await Promise.all([
    prisma.student.count({ where: { schoolId, status: "enrolled" } }),
    prisma.journey.findMany({ where: { schoolId, date: today }, include: { boardings: true } }),
    prisma.trip.count({ where: { schoolId, status: "active" } }),
    prisma.trip.count({ where: { schoolId, isResidential: true, status: { in: ["planned", "active"] } } }),
    prisma.calendarEvent.count({ where: { schoolId, status: "published", startsAt: { gte: new Date(`${today}T00:00:00`), lte: new Date(`${today}T23:59:59`) } } }),
    prisma.integration.findMany({ where: { schoolId } }),
  ]);

  const activeBuses = todayJourneys.filter((j) => j.status === "started" || j.status === "approaching").length;
  const delayedRoutes = todayJourneys.filter((j) => j.delayMinutes > 0).length;
  const onboard = todayJourneys.reduce((n, j) => n + j.boardings.filter((b) => b.status === "boarded").length, 0);
  const absentBoardings = new Set<string>();
  todayJourneys.forEach((j) => j.boardings.forEach((b) => { if (b.status === "absent" || b.status === "not_present") absentBoardings.add(b.studentId); }));
  const absenceRequests = await prisma.transportRequest.count({ where: { schoolId, date: today, type: "absence" } });
  const absent = absentBoardings.size + absenceRequests;

  const [pendingTripConsent, incidentsToday, emergencyMsgs] = await Promise.all([
    prisma.tripStudent.count({ where: { consent: "pending", trip: { schoolId } } }),
    prisma.incident.count({ where: { schoolId, at: { gte: new Date(`${today}T00:00:00`) } } }),
    prisma.message.count({ where: { schoolId, priority: "emergency", createdAt: { gte: new Date(Date.now() - 7 * 864e5) } } }),
  ]);

  // ---- Insights: reflect ALL data in the school (imported, API-fed or manual),
  // not just today's live operations. Powers the cards + charts + upcoming feed.
  const nowD = new Date();
  const [
    studentsByStatus, studentsByYear, studentsBySource, staffCount, guardianCount,
    vehiclesCount, routesCount, menuCount, tripsByStatus, reportsCount, classesCount,
    upcomingEvents, upcomingTrips,
  ] = await Promise.all([
    prisma.student.groupBy({ by: ["status"], where: { schoolId }, _count: { _all: true } }),
    prisma.student.groupBy({ by: ["yearGroup"], where: { schoolId, status: "enrolled" }, _count: { _all: true } }),
    prisma.student.groupBy({ by: ["source"], where: { schoolId }, _count: { _all: true } }),
    prisma.staffProfile.count({ where: { schoolId } }),
    prisma.user.count({ where: { memberships: { some: { schoolId, role: "Parent" } } } }),
    prisma.vehicle.count({ where: { schoolId } }),
    prisma.route.count({ where: { schoolId } }),
    prisma.menuItem.count({ where: { schoolId } }),
    prisma.trip.groupBy({ by: ["status"], where: { schoolId }, _count: { _all: true } }),
    prisma.studentReport.count({ where: { schoolId } }),
    prisma.schoolClass.count({ where: { schoolId } }),
    prisma.calendarEvent.findMany({ where: { schoolId, status: "published", startsAt: { gte: nowD } }, orderBy: { startsAt: "asc" }, take: 6, select: { id: true, title: true, category: true, startsAt: true } }),
    prisma.trip.findMany({ where: { schoolId, date: { gte: today }, status: { in: ["planned", "active"] } }, orderBy: { date: "asc" }, take: 6, select: { id: true, title: true, date: true, destination: true } }),
  ]);

  const byKey = (arr: any[], k = "status") => Object.fromEntries(arr.map((g) => [g[k] ?? "—", g._count._all]));
  const upcoming = [
    ...upcomingEvents.map((e) => ({ kind: "event" as const, id: e.id, title: e.title, when: e.startsAt.toISOString(), meta: e.category })),
    ...upcomingTrips.map((t) => ({ kind: "trip" as const, id: t.id, title: t.title, when: `${t.date}T00:00:00.000Z`, meta: t.destination || "trip" })),
  ].sort((a, b) => a.when.localeCompare(b.when)).slice(0, 8);

  return {
    date: today,
    tiles: {
      studentsPresent: Math.max(0, enrolled - absent),
      studentsAbsent: absent,
      activeBuses,
      delayedRoutes,
      studentsOnboard: onboard,
      activeTrips,
      residentialTrips,
      eventsToday,
      outstandingConsent: pendingTripConsent,
      messagesAttention: emergencyMsgs,
      integrationFailures: integrations.filter((i) => i.status === "error").length,
      transportIncidents: incidentsToday,
    },
    insights: {
      counts: {
        students: studentsByStatus.reduce((n, g) => n + g._count._all, 0),
        enrolled,
        staff: staffCount,
        guardians: guardianCount,
        vehicles: vehiclesCount,
        routes: routesCount,
        menuItems: menuCount,
        trips: tripsByStatus.reduce((n, g) => n + g._count._all, 0),
        reports: reportsCount,
        classes: classesCount,
      },
      studentsByStatus: byKey(studentsByStatus),
      studentsBySource: byKey(studentsBySource, "source"),
      studentsByYear: studentsByYear.map((g) => ({ label: g.yearGroup || "Unassigned", value: g._count._all })).sort((a, b) => a.label.localeCompare(b.label)),
      tripsByStatus: byKey(tripsByStatus),
      attendance: { present: Math.max(0, enrolled - absent), absent },
      upcoming,
    },
  };
}

// -------------------------------------------------------------------- reports

export type Report = { type: string; title: string; generatedAt: string; metrics: { label: string; value: string | number }[]; table: { headers: string[]; rows: (string | number)[][] } };

export async function buildReport(schoolId: string, type: string): Promise<Report> {
  const generatedAt = new Date().toISOString();
  const since = dayStr(-30);

  if (type === "transport") {
    const journeys = await prisma.journey.findMany({ where: { schoolId, date: { gte: since } }, include: { boardings: true, route: { select: { name: true } } } });
    const completed = journeys.filter((j) => j.status === "completed");
    const onTime = journeys.filter((j) => j.delayMinutes <= 5).length;
    const avgDelay = journeys.length ? journeys.reduce((n, j) => n + j.delayMinutes, 0) / journeys.length : 0;
    const missed = journeys.reduce((n, j) => n + j.boardings.filter((b) => b.status === "not_present" || b.status === "absent").length, 0);
    const byRoute = new Map<string, { runs: number; delay: number }>();
    journeys.forEach((j) => { const r = byRoute.get(j.route.name) || { runs: 0, delay: 0 }; r.runs++; r.delay += j.delayMinutes; byRoute.set(j.route.name, r); });
    return {
      type, title: "Transport report (last 30 days)", generatedAt,
      metrics: [
        { label: "Journeys", value: journeys.length },
        { label: "Punctuality (≤5 min)", value: journeys.length ? `${Math.round((onTime / journeys.length) * 100)}%` : "—" },
        { label: "Avg delay / ETA drift", value: `${avgDelay.toFixed(1)} min` },
        { label: "Missed collections", value: missed },
        { label: "Completed journeys", value: completed.length },
      ],
      table: { headers: ["Route", "Runs", "Avg delay (min)"], rows: Array.from(byRoute.entries()).map(([name, r]) => [name, r.runs, (r.delay / r.runs).toFixed(1)]) },
    };
  }

  if (type === "trips") {
    const trips = await prisma.trip.findMany({ where: { schoolId }, include: { students: true } });
    const totalStudents = trips.reduce((n, t) => n + t.students.length, 0);
    const consented = trips.reduce((n, t) => n + t.students.filter((s) => s.consent === "given").length, 0);
    return {
      type, title: "Trip report", generatedAt,
      metrics: [
        { label: "Trips", value: trips.length },
        { label: "Total participants", value: totalStudents },
        { label: "Consent completion", value: totalStudents ? `${Math.round((consented / totalStudents) * 100)}%` : "—" },
      ],
      table: { headers: ["Trip", "Date", "Participants", "Consent given", "Status"], rows: trips.map((t) => [t.title, t.date, t.students.length, t.students.filter((s) => s.consent === "given").length, t.status]) },
    };
  }

  if (type === "engagement") {
    const [notifs, read, guardians] = await Promise.all([
      prisma.notification.count({ where: { schoolId } }),
      prisma.notification.count({ where: { schoolId, read: true } }),
      prisma.membership.count({ where: { schoolId, role: "Parent" } }),
    ]);
    const engaged = await prisma.notification.findMany({ where: { schoolId, read: true }, distinct: ["userId"], select: { userId: true } });
    return {
      type, title: "Parent engagement report", generatedAt,
      metrics: [
        { label: "Notifications sent", value: notifs },
        { label: "Read rate", value: notifs ? `${Math.round((read / notifs) * 100)}%` : "—" },
        { label: "Parents", value: guardians },
        { label: "Engaged parents", value: engaged.length },
        { label: "Engagement rate", value: guardians ? `${Math.round((engaged.length / guardians) * 100)}%` : "—" },
      ],
      table: { headers: ["Metric", "Value"], rows: [["Notifications", notifs], ["Read", read], ["Parents", guardians], ["Engaged", engaged.length]] },
    };
  }

  if (type === "ai") {
    const queries = await prisma.aiQuery.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" }, take: 1000 });
    const found = queries.filter((q) => q.found).length;
    const counts = new Map<string, number>();
    queries.forEach((q) => { const k = q.question.trim().toLowerCase().slice(0, 80); counts.set(k, (counts.get(k) || 0) + 1); });
    const common = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return {
      type, title: "AI usage report", generatedAt,
      metrics: [
        { label: "AI queries", value: queries.length },
        { label: "Answered (found)", value: queries.length ? `${Math.round((found / queries.length) * 100)}%` : "—" },
      ],
      table: { headers: ["Common question", "Times asked"], rows: common.map(([q, n]) => [q, n]) },
    };
  }

  if (type === "integrations") {
    const integrations = await prisma.integration.findMany({ where: { schoolId }, include: { runs: { orderBy: { startedAt: "desc" }, take: 50 } } });
    const rows = integrations.map((i) => {
      const runs = i.runs; const okc = runs.filter((r) => r.status === "success" || r.status === "partial").length;
      return [i.name, i.status, runs.length, runs.length ? `${Math.round((okc / runs.length) * 100)}%` : "—", i.lastError || ""];
    });
    const allRuns = integrations.flatMap((i) => i.runs);
    const okAll = allRuns.filter((r) => r.status === "success" || r.status === "partial").length;
    return {
      type, title: "Integration report", generatedAt,
      metrics: [
        { label: "Integrations", value: integrations.length },
        { label: "In error", value: integrations.filter((i) => i.status === "error").length },
        { label: "Sync success rate", value: allRuns.length ? `${Math.round((okAll / allRuns.length) * 100)}%` : "—" },
      ],
      table: { headers: ["Connector", "Status", "Runs", "Success %", "Last error"], rows },
    };
  }

  if (type === "students") {
    const students = await prisma.student.findMany({ where: { schoolId }, select: { yearGroup: true, status: true } });
    const byStatus = (st: string) => students.filter((s) => s.status === st).length;
    const years = new Map<string, number>();
    students.forEach((s) => { const y = s.yearGroup || "Unspecified"; years.set(y, (years.get(y) || 0) + 1); });
    return {
      type, title: "Pupil roll report", generatedAt,
      metrics: [
        { label: "Total pupils", value: students.length },
        { label: "Enrolled", value: byStatus("enrolled") },
        { label: "Applicants", value: byStatus("applicant") },
        { label: "Leavers", value: byStatus("leaver") },
        { label: "Archived", value: byStatus("archived") },
      ],
      table: { headers: ["Year group", "Pupils"], rows: Array.from(years.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([y, n]) => [y, n]) },
    };
  }

  if (type === "attendance") {
    const recs = await prisma.attendanceRecord.findMany({ where: { schoolId, date: { gte: since } }, select: { status: true } });
    const c = (st: string) => recs.filter((r) => r.status === st).length;
    const present = c("present"), late = c("late"), total = recs.length, attended = present + late;
    return {
      type, title: "Attendance report (last 30 days)", generatedAt,
      metrics: [
        { label: "Sessions recorded", value: total },
        { label: "Attendance rate", value: total ? `${Math.round((attended / total) * 100)}%` : "—" },
        { label: "Present", value: present },
        { label: "Late", value: late },
        { label: "Unauthorised absence", value: c("unauthorised") },
      ],
      table: { headers: ["Status", "Count"], rows: ["present", "late", "authorised", "unauthorised", "excused", "absent"].map((st) => [st, c(st)]) },
    };
  }

  if (type === "clubs") {
    let clubs: any[] = [];
    try {
      clubs = await prisma.club.findMany({ where: { schoolId }, include: { members: { select: { status: true } }, sessions: { select: { attendance: { select: { status: true } } } } } });
    } catch { clubs = []; }
    const attendedOf = (c: any) => { const mk = c.sessions.flatMap((s: any) => s.attendance); const p = mk.filter((a: any) => a.status === "present" || a.status === "late").length; return { total: mk.length, pct: mk.length ? Math.round((p / mk.length) * 100) : null }; };
    const enrolments = clubs.reduce((n, c) => n + c.members.filter((m: any) => m.status === "enrolled").length, 0);
    const sessions = clubs.reduce((n, c) => n + c.sessions.length, 0);
    const allMarks = clubs.flatMap((c) => c.sessions.flatMap((s: any) => s.attendance));
    const presentAll = allMarks.filter((a: any) => a.status === "present" || a.status === "late").length;
    return {
      type, title: "Clubs & activities report", generatedAt,
      metrics: [
        { label: "Clubs", value: clubs.length },
        { label: "Active clubs", value: clubs.filter((c) => c.status === "active").length },
        { label: "Total enrolments", value: enrolments },
        { label: "Sessions logged", value: sessions },
        { label: "Attendance rate", value: allMarks.length ? `${Math.round((presentAll / allMarks.length) * 100)}%` : "—" },
      ],
      table: {
        headers: ["Club", "Category", "Members", "Sessions", "Attendance %", "Status"],
        rows: clubs.map((c) => { const a = attendedOf(c); return [c.name, c.category, c.members.filter((m: any) => m.status === "enrolled").length, c.sessions.length, a.pct == null ? "—" : `${a.pct}%`, c.status]; }),
      },
    };
  }

  // overview (default)
  const dash = await opsDashboard(schoolId);
  const rewards = await prisma.rewardRecord.count({ where: { schoolId, at: { gte: new Date(Date.now() - 30 * 864e5) } } });
  return {
    type: "overview", title: "Operations overview", generatedAt,
    metrics: Object.entries(dash.tiles).map(([k, v]) => ({ label: k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()), value: v })),
    table: { headers: ["Metric", "Value"], rows: [...Object.entries(dash.tiles).map(([k, v]) => [k, v] as [string, number]), ["rewardRecords30d", rewards]] },
  };
}

/** Trust-level roll-up across all schools in a group. */
export async function trustReport(groupId: string) {
  const schools = await prisma.school.findMany({ where: { groupId } });
  const rows: (string | number)[][] = [];
  for (const s of schools) {
    const d = await opsDashboard(s.id);
    rows.push([s.name, d.tiles.studentsPresent, d.tiles.studentsAbsent, d.tiles.activeBuses, d.tiles.delayedRoutes, d.tiles.activeTrips, d.tiles.integrationFailures]);
  }
  return { title: "Trust-level overview", headers: ["School", "Present", "Absent", "Active buses", "Delayed", "Active trips", "Integration failures"], rows };
}

// -------------------------------------------------------------------- exports

export function reportToCsv(r: Report): string {
  const q = (v: any) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [`${r.title}`, `Generated,${r.generatedAt}`, "", "Metric,Value", ...r.metrics.map((m) => `${q(m.label)},${q(m.value)}`), "", r.table.headers.map(q).join(","), ...r.table.rows.map((row) => row.map(q).join(","))];
  return lines.join("\r\n");
}

/** The summary + detail sheets for a report (shared by the .xls export and the
 *  governed export, which prepends a "Download info" sheet). */
export function reportSheets(r: Report): Sheet[] {
  return [
    { name: "Summary", title: r.title, headers: ["Metric", "Value"], rows: r.metrics.map((m) => [m.label, m.value]) },
    { name: "Detail", headers: r.table.headers, rows: r.table.rows },
  ];
}

/** Excel (SpreadsheetML .xls) export of a report — summary + detail sheets. */
export function reportToXls(r: Report): Buffer {
  return sheetsToXls(reportSheets(r));
}

/** Flatten a report into text paragraphs for the branded PDF template
 *  (metrics list followed by the detail table as monospace rows). */
export function reportToParagraphs(r: Report): string[] {
  const lines: string[] = [`Generated: ${r.generatedAt}`, "", "Metrics"];
  r.metrics.forEach((m) => lines.push(`  ${m.label}: ${m.value}`));
  lines.push("", r.table.headers.join("  |  "));
  r.table.rows.forEach((row) => lines.push(row.map((c) => String(c ?? "")).join("  |  ")));
  return lines;
}

/** Minimal, dependency-free single-page PDF of a report (text lines). */
export function reportToPdf(r: Report): Buffer {
  const lines: string[] = [r.title, `Generated: ${r.generatedAt}`, "", "Metrics:"];
  r.metrics.forEach((m) => lines.push(`  ${m.label}: ${m.value}`));
  lines.push("", r.table.headers.join("  |  "));
  r.table.rows.slice(0, 30).forEach((row) => lines.push(row.join("  |  ")));

  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  let y = 780;
  const content = ["BT", "/F1 11 Tf", "12 TL", `1 0 0 1 40 ${y} Tm`, ...lines.flatMap((l) => [`(${esc(l).slice(0, 100)}) Tj`, "T*"]), "ET"].join("\n");

  const objs: string[] = [];
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>");
  objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => { pdf += `${String(off).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
