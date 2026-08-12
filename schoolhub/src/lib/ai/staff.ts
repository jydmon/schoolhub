import { prisma } from "../db";
import { ROLES, ROLE_LABELS } from "../constants";
import type { Answer } from "./answer";

const has = (q: string, ...words: string[]) => words.every((w) => q.includes(w));
const hasAny = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

const STAFF_ROLES: string[] = [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.TEACHER, ROLES.TRANSPORT_MANAGER, ROLES.DRIVER, ROLES.SUPPORT_STAFF, ROLES.INTEGRATION_ADMIN];

/**
 * Answer staff-only operational questions that need computed data rather than
 * document retrieval (consent outstanding, policies due for review, trips today,
 * today's activities). Returns null if the question doesn't match — the caller
 * then falls back to normal retrieval. Only ever called for staff users.
 */
export async function staffAnalytics(question: string, schoolIds: string[], now = new Date()): Promise<Answer | null> {
  const q = question.toLowerCase();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);

  // Roster headcounts — "how many students / teachers / staff / parents", incl.
  // a specific year group / status. Computed live; answers only what was asked.
  {
    const aboutStudents = hasAny(q, "student", "pupil", "children", "child", "learner");
    const aboutTeachers = q.includes("teacher");
    const aboutStaff = hasAny(q, "staff", "employee", "member of staff", "teaching staff");
    const aboutParents = hasAny(q, "parent", "guardian", "carer");
    const aboutUsers = hasAny(q, "user", "people", "account", "member", "on this portal", "on the portal", "registered");
    const yearMatch = q.match(/\b(?:year|yr|grade|y)\s*(\d{1,2})\b/);
    const kwMatch = /\b(reception|nursery|foundation|kindergarten|pre-?school|sixth\s?form)\b/.exec(q);
    const statusMatch = /\b(enrolled|applicant|applicants|leaver|leavers|archived)\b/.exec(q);
    const countish = hasAny(q, "how many", "number of", "count", "total", "registered", "enrolled", "on roll", "how much") || (aboutStudents && (!!yearMatch || !!kwMatch || !!statusMatch));

    if (countish && (aboutStudents || aboutTeachers || aboutStaff || aboutParents || aboutUsers)) {
      const [studentCount, byStatus, byYear, mem] = await Promise.all([
        prisma.student.count({ where: { schoolId: { in: schoolIds } } }),
        prisma.student.groupBy({ by: ["status"], where: { schoolId: { in: schoolIds } }, _count: { _all: true } }),
        prisma.student.groupBy({ by: ["yearGroup"], where: { schoolId: { in: schoolIds } }, _count: { _all: true } }),
        prisma.membership.groupBy({ by: ["role"], where: { schoolId: { in: schoolIds } }, _count: { _all: true } }),
      ]);
      const roleCount = (r: string) => mem.find((m) => m.role === r)?._count._all ?? 0;
      const teachers = roleCount(ROLES.TEACHER);
      const parents = roleCount(ROLES.PARENT);
      const staffTotal = mem.filter((m) => STAFF_ROLES.includes(m.role)).reduce((s, m) => s + m._count._all, 0);
      const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;

      // 1) A SPECIFIC year group / status was named → answer only that.
      if (aboutStudents && (yearMatch || kwMatch)) {
        const digits = yearMatch ? yearMatch[1] : null;
        const kw = kwMatch ? kwMatch[1].toLowerCase().replace(/\s|-/g, "") : null;
        const matches = byYear.filter((y) => {
          const yg = String(y.yearGroup || "");
          if (digits) return (yg.match(/\d+/)?.[0] ?? "") === digits;
          return yg.toLowerCase().replace(/\s|-/g, "").includes(kw!);
        });
        const label = matches[0]?.yearGroup || (digits ? `Year ${digits}` : kwMatch![1]);
        const n = matches.reduce((s, y) => s + y._count._all, 0);
        const ans = n > 0
          ? `There ${n === 1 ? "is" : "are"} ${plural(n, "pupil")} in ${label}.`
          : `I don't have any pupils recorded in ${digits ? `Year ${digits}` : kwMatch![1]}.`;
        return { answer: ans, citations: [], found: true };
      }
      if (aboutStudents && statusMatch && !aboutTeachers && !aboutStaff && !aboutParents) {
        const st = statusMatch[1].replace(/s$/, "");
        const n = byStatus.find((s) => s.status === st)?._count._all ?? 0;
        return { answer: `There ${n === 1 ? "is" : "are"} ${plural(n, "pupil")} with the status “${st}”.`, citations: [], found: true };
      }

      // 2) A single entity was asked → one precise sentence.
      const onlyStudents = aboutStudents && !aboutTeachers && !aboutStaff && !aboutParents && !aboutUsers;
      const onlyTeachers = aboutTeachers && !aboutStudents && !aboutStaff && !aboutParents && !aboutUsers;
      const onlyParents = aboutParents && !aboutStudents && !aboutTeachers && !aboutStaff && !aboutUsers;
      const onlyStaff = aboutStaff && !aboutStudents && !aboutTeachers && !aboutParents && !aboutUsers;
      const wantsBreakdown = hasAny(q, "breakdown", "by year", "each year", "per year", "by class", "every year", "by group", "by status");

      if (onlyStudents && !wantsBreakdown) {
        const enrolled = byStatus.find((s) => s.status === "enrolled")?._count._all ?? 0;
        const others = byStatus.filter((s) => s.status !== "enrolled" && s._count._all > 0);
        const tail = others.length === 0 ? " (all enrolled)" : ` (${byStatus.filter((s) => s._count._all > 0).map((s) => `${s._count._all} ${s.status}`).join(", ")})`;
        return { answer: `There ${studentCount === 1 ? "is" : "are"} ${plural(studentCount, "pupil")} on record${tail}.`, citations: [], found: true };
      }
      if (onlyTeachers) return { answer: `There ${teachers === 1 ? "is" : "are"} ${plural(teachers, "teacher")} with a portal account.`, citations: [], found: true };
      if (onlyParents) return { answer: `There ${parents === 1 ? "is" : "are"} ${plural(parents, "parent/guardian account")}.`, citations: [], found: true };
      if (onlyStaff) {
        const breakdown = mem.filter((m) => STAFF_ROLES.includes(m.role) && m._count._all > 0).map((m) => `${m._count._all} ${ROLE_LABELS[m.role] || m.role}`).join(", ");
        return { answer: `There ${staffTotal === 1 ? "is" : "are"} ${plural(staffTotal, "staff member")} with a portal account${breakdown ? ` — ${breakdown}` : ""}.`, citations: [], found: true };
      }

      // 3) Multiple entities / general "who's on the portal" → a compact summary.
      const lines: string[] = ["Here's what your records show:\n"];
      if (aboutStudents || aboutUsers) {
        lines.push(`• Pupils: ${studentCount}${byStatus.length ? ` (${byStatus.filter((s) => s._count._all > 0).map((s) => `${s._count._all} ${s.status}`).join(", ")})` : ""}`);
        if (wantsBreakdown) {
          const yr = byYear.filter((y) => y.yearGroup).sort((a, b) => String(a.yearGroup).localeCompare(String(b.yearGroup)));
          if (yr.length) lines.push(`   By year group: ${yr.map((y) => `${y.yearGroup} — ${y._count._all}`).join(", ")}`);
        }
      }
      if (aboutTeachers) lines.push(`• Teachers: ${teachers}`);
      if (aboutStaff || aboutUsers) lines.push(`• Staff (all roles): ${staffTotal}`);
      if (aboutParents || aboutUsers) lines.push(`• Parents / guardians: ${parents}`);
      return { answer: lines.join("\n"), citations: [], found: true };
    }
  }

  // Policies due for review
  if (has(q, "review") && hasAny(q, "polic", "document", "due")) {
    const soon = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
    const docs = await prisma.document.findMany({
      where: { schoolId: { in: schoolIds }, reviewDate: { lte: soon }, status: { in: ["approved", "published"] } },
      orderBy: { reviewDate: "asc" }, take: 25,
    });
    if (docs.length === 0) return { answer: "No documents are due for review in the next 30 days.", citations: [], found: true };
    const lines = ["Documents due for review (next 30 days):\n", ...docs.map((d) => `• **${d.title}** — review by ${d.reviewDate ? new Date(d.reviewDate).toLocaleDateString("en-GB") : "?"} (${d.status})`)];
    return { answer: lines.join("\n"), citations: docs.map((d) => ({ title: d.title, type: "document", source: "Knowledge Hub", date: d.reviewDate, url: null })), found: true };
  }

  // Outstanding consent
  if (has(q, "consent") && hasAny(q, "not", "outstanding", "missing", "complete", "haven")) {
    const events = await prisma.calendarEvent.findMany({
      where: { schoolId: { in: schoolIds }, consentRequired: true, startsAt: { gte: startOfDay } },
      include: { _count: { select: { consents: true, students: true } } }, orderBy: { startsAt: "asc" }, take: 25,
    });
    if (events.length === 0) return { answer: "There are no upcoming events that require consent.", citations: [], found: true };
    const lines = ["Upcoming consent-required events and responses recorded so far:\n",
      ...events.map((e) => `• **${e.title}** (${new Date(e.startsAt).toLocaleDateString("en-GB")}) — ${e._count.consents} consent response(s) recorded${e._count.students ? `, ${e._count.students} named participant(s)` : ""}.`)];
    lines.push("\n_Tip: use the AI drafting tool to draft a reminder for outstanding consent._");
    return { answer: lines.join("\n"), citations: events.map((e) => ({ title: e.title, type: "event", source: "School calendar", date: e.startsAt, url: null })), found: true };
  }

  // Trips today / activities today
  if ((has(q, "trip") && hasAny(q, "today", "happening")) || has(q, "activities", "today") || has(q, "today", "school")) {
    const cat = has(q, "trip") ? { category: "trip" } : {};
    const events = await prisma.calendarEvent.findMany({
      where: { schoolId: { in: schoolIds }, status: { not: "cancelled" }, startsAt: { gte: startOfDay, lte: endOfDay }, ...cat },
      orderBy: { startsAt: "asc" }, take: 25,
    });
    const noun = has(q, "trip") ? "trips" : "activities";
    if (events.length === 0) return { answer: `There are no ${noun} scheduled for today.`, citations: [], found: true };
    const lines = [`Today's ${noun}:\n`, ...events.map((e) => `• **${e.title}** — ${new Date(e.startsAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}${e.location ? ` @ ${e.location}` : ""}`)];
    return { answer: lines.join("\n"), citations: events.map((e) => ({ title: e.title, type: "event", source: "School calendar", date: e.startsAt, url: null })), found: true };
  }

  // Transport incidents / bus delays — no live transport module yet (honest answer).
  if (hasAny(q, "bus", "coach", "transport") && hasAny(q, "delay", "incident", "late")) {
    return { answer: "Live transport tracking (bus/coach delays and incidents) isn't available yet — that arrives with the Transport module. I can't see real-time vehicle data, so I won't guess.", citations: [], found: false };
  }

  return null;
}
