import { prisma } from "./db";
import { parseCsv } from "./csv";
import { recordAudit } from "./audit";
import {
  AUDIT,
  ROLES,
  STUDENT_STATUSES,
  SCHOOL_ROLES,
  ImportType,
} from "./constants";

export type RowError = { row: number; field?: string; message: string; fatal: boolean };
export type ImportResult = {
  batchId: string;
  status: "completed" | "partial" | "failed";
  totalRows: number;
  createdRows: number;
  updatedRows: number;
  skippedRows: number;
  errorRows: number;
  errors: RowError[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseBool(v: string): boolean {
  return /^(1|true|yes|y)$/i.test(v.trim());
}

/** Tri-state consent flag: true / false / undefined (column blank → leave unchanged). */
function parseTriBool(v?: string): boolean | undefined {
  const s = (v ?? "").trim();
  if (!s) return undefined;
  if (/^(1|true|yes|y|opt.?in|consent(ed)?|granted)$/i.test(s)) return true;
  if (/^(0|false|no|n|opt.?out|declined|withdrawn|revoked)$/i.test(s)) return false;
  throw new Error(`"${s}" is not a valid consent value (use yes/no)`);
}

/** Returns a Date, null (empty), or throws Error(message) if malformed. */
function parseDate(v: string, field: string): Date | null {
  const s = v.trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`${field} must be YYYY-MM-DD`);
  const d = new Date(`${s}T00:00:00.000Z`);
  if (isNaN(d.getTime())) throw new Error(`${field} is not a valid date`);
  return d;
}

/** Parse "YYYY-MM-DD HH:MM" (or ...T...). Required — throws if blank/malformed. */
function parseDateTime(v: string, field: string): Date {
  const s = v.trim();
  if (!s) throw new Error(`${field} is required (YYYY-MM-DD HH:MM)`);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) throw new Error(`${field} must be "YYYY-MM-DD HH:MM"`);
  const d = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4] || "00"}.000Z`);
  if (isNaN(d.getTime())) throw new Error(`${field} is not a valid date/time`);
  return d;
}
function parseDateTimeOpt(v: string, field: string): Date | null {
  return (v ?? "").trim() ? parseDateTime(v, field) : null;
}

async function upsertClass(schoolId: string, name: string, yearGroup?: string): Promise<string> {
  const existing = await prisma.schoolClass.findUnique({
    where: { schoolId_name: { schoolId, name } },
  });
  if (existing) return existing.id;
  const created = await prisma.schoolClass.create({
    data: { schoolId, name, yearGroup: yearGroup || null },
  });
  return created.id;
}

export async function runImport(opts: {
  schoolId: string;
  type: ImportType;
  csvText: string;
  filename?: string;
  actorUserId?: string;
  actorEmail?: string;
}): Promise<ImportResult> {
  const { schoolId, type, csvText } = opts;
  const { rows } = parseCsv(csvText);
  const errors: RowError[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Row numbers are 1-based over data rows; +1 in messages to align with the
  // spreadsheet (header = line 1).
  const seen = new Set<string>();

  // Attendance is the highest-volume import (a whole school, potentially every
  // day), so it uses a batched path: resolve pupils and existing marks in two
  // queries, then write with createMany / grouped updateMany. This replaces the
  // previous per-row "find pupil → find record → create/update" loop, which
  // fired ~3 sequential DB round-trips per row and made large files time out.
  if (type === "attendance") {
    const pending: { line: number; ref: string; date: string; session: string; status: string; note: string | null }[] = [];
    const refs = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const line = i + 2;
      const row = rows[i];
      try {
        const ref = row.studentReference?.trim();
        if (!ref) throw new Error("studentReference is required");
        const date = (row.date || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
        const sRaw = (row.session || "").trim().toLowerCase();
        const session = ["am", "pm", "day"].includes(sRaw) ? sRaw : "am";
        const stRaw = (row.status || "").trim().toLowerCase();
        const status = ["present", "late", "authorised", "unauthorised", "excused", "absent"].includes(stRaw) ? stRaw : "present";
        const note = row.note?.trim() || null;
        const dupKey = "att:" + ref.toLowerCase() + ":" + date + ":" + session;
        if (seen.has(dupKey)) { skipped++; errors.push({ row: line, field: "studentReference", message: `duplicate attendance for "${ref}" ${date} ${session} in file`, fatal: false }); continue; }
        seen.add(dupKey);
        refs.add(ref);
        pending.push({ line, ref, date, session, status, note });
      } catch (err) {
        errors.push({ row: line, message: (err as Error).message, fatal: true });
      }
    }

    // 1 query: resolve every referenced pupil.
    const students = refs.size
      ? await prisma.student.findMany({ where: { schoolId, reference: { in: Array.from(refs) } }, select: { id: true, reference: true } })
      : [];
    const idByRef = new Map(students.map((s) => [s.reference, s.id] as const));
    const wants: { line: number; studentId: string; date: string; session: string; status: string; note: string | null }[] = [];
    for (const p of pending) {
      const studentId = idByRef.get(p.ref);
      if (!studentId) { errors.push({ row: p.line, field: "studentReference", message: `student "${p.ref}" not found`, fatal: true }); continue; }
      wants.push({ line: p.line, studentId, date: p.date, session: p.session, status: p.status, note: p.note });
    }

    // 1 query: load existing marks for the affected pupils + dates.
    const studentIds = Array.from(new Set(wants.map((w) => w.studentId)));
    const dates = Array.from(new Set(wants.map((w) => w.date)));
    const existingRows = studentIds.length
      ? await prisma.attendanceRecord.findMany({ where: { studentId: { in: studentIds }, date: { in: dates } }, select: { id: true, studentId: true, date: true, session: true, status: true, note: true } })
      : [];
    const existing = new Map(existingRows.map((e) => [`${e.studentId}|${e.date}|${e.session}`, e] as const));

    const toCreate: { schoolId: string; studentId: string; date: string; session: string; status: string; note: string | null; source: string }[] = [];
    const updateGroups = new Map<string, { ids: string[]; status: string; note: string | null }>();
    for (const w of wants) {
      const ex = existing.get(`${w.studentId}|${w.date}|${w.session}`);
      if (!ex) {
        toCreate.push({ schoolId, studentId: w.studentId, date: w.date, session: w.session, status: w.status, note: w.note, source: "import" });
        created++;
      } else {
        updated++;
        if (ex.status === w.status && (ex.note ?? null) === (w.note ?? null)) continue; // unchanged — no write
        const gk = `${w.status}|${w.note ?? ""}`;
        const g = updateGroups.get(gk) || { ids: [], status: w.status, note: w.note };
        g.ids.push(ex.id);
        updateGroups.set(gk, g);
      }
    }

    // Bulk writes: a handful of queries regardless of file size.
    const CHUNK = 500;
    for (let i = 0; i < toCreate.length; i += CHUNK) {
      await prisma.attendanceRecord.createMany({ data: toCreate.slice(i, i + CHUNK), skipDuplicates: true });
    }
    for (const g of updateGroups.values()) {
      for (let i = 0; i < g.ids.length; i += CHUNK) {
        await prisma.attendanceRecord.updateMany({ where: { id: { in: g.ids.slice(i, i + CHUNK) } }, data: { status: g.status, note: g.note, source: "import" } });
      }
    }
  }

  // Clubs & activities — one row per club, matched by name (per school).
  if (type === "clubs_activities") {
    const items: { line: number; name: string; data: { category: string; description: string | null; location: string | null; cadence: string; dayOfWeek: string | null; startTime: string | null; endTime: string | null; yearGroup: string | null; capacity: number | null; cost: number; staffLead: string | null; status: string; source: string } }[] = [];
    const namesSeen = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const line = i + 2;
      const row = rows[i];
      try {
        const name = row.name?.trim();
        if (!name) throw new Error("name is required");
        if (namesSeen.has(name.toLowerCase())) { skipped++; errors.push({ row: line, field: "name", message: `duplicate club "${name}" in file`, fatal: false }); continue; }
        namesSeen.add(name.toLowerCase());
        const capRaw = (row.capacity || "").trim();
        const capacity = capRaw ? parseInt(capRaw, 10) : null;
        if (capacity !== null && (isNaN(capacity) || capacity < 0)) throw new Error("capacity must be a whole number");
        const costRaw = (row.cost || "").replace(/[£,\s]/g, "").trim();
        const cost = costRaw ? Math.round(parseFloat(costRaw) * 100) : 0;
        if (costRaw && (isNaN(cost) || cost < 0)) throw new Error("cost must be a number in pounds, e.g. 2.50");
        items.push({ line, name, data: {
          category: (row.category?.trim() || "general").toLowerCase(),
          description: row.description?.trim() || null,
          location: row.location?.trim() || null,
          cadence: (row.cadence?.trim() || "weekly").toLowerCase(),
          dayOfWeek: row.dayOfWeek?.trim() || null,
          startTime: row.startTime?.trim() || null,
          endTime: row.endTime?.trim() || null,
          yearGroup: row.yearGroup?.trim() || null,
          capacity, cost,
          staffLead: row.staffLead?.trim() || null,
          status: (row.status?.trim() || "active").toLowerCase(),
          source: "import",
        } });
      } catch (err) { errors.push({ row: line, message: (err as Error).message, fatal: true }); }
    }
    const existingClubs = await prisma.club.findMany({ where: { schoolId }, select: { id: true, name: true } });
    const clubByName = new Map(existingClubs.map((c) => [c.name.toLowerCase(), c.id] as const));
    const create: { schoolId: string; name: string; category: string; description: string | null; location: string | null; cadence: string; dayOfWeek: string | null; startTime: string | null; endTime: string | null; yearGroup: string | null; capacity: number | null; cost: number; staffLead: string | null; status: string; source: string }[] = [];
    for (const it of items) {
      const id = clubByName.get(it.name.toLowerCase());
      if (id) { await prisma.club.update({ where: { id }, data: it.data }); updated++; }
      else { create.push({ schoolId, name: it.name, ...it.data }); created++; }
    }
    for (let i = 0; i < create.length; i += 500) await prisma.club.createMany({ data: create.slice(i, i + 500) });
  }

  // Class timetables — matched by (day, start time, class, subject).
  if (type === "timetables") {
    const DOW: Record<string, number> = { mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6, sun: 7, sunday: 7 };
    const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;
    const emails = new Set<string>();
    const items: { line: number; key: string; dayOfWeek: number; period: string | null; startTime: string; endTime: string; subject: string; yearGroup: string | null; className: string | null; room: string | null; teacherEmail: string | null }[] = [];
    const seenKeys = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const line = i + 2;
      const row = rows[i];
      try {
        const dRaw = (row.dayOfWeek || "").trim().toLowerCase();
        const dayOfWeek = /^[1-7]$/.test(dRaw) ? parseInt(dRaw, 10) : DOW[dRaw];
        if (!dayOfWeek) throw new Error("dayOfWeek must be Mon–Sun or 1–7");
        const startTime = (row.startTime || "").trim();
        const endTime = (row.endTime || "").trim();
        if (!HHMM.test(startTime)) throw new Error("startTime must be HH:MM");
        if (!HHMM.test(endTime)) throw new Error("endTime must be HH:MM");
        const subject = row.subject?.trim();
        if (!subject) throw new Error("subject is required");
        const className = row.className?.trim() || null;
        const teacherEmail = row.teacherEmail?.trim().toLowerCase() || null;
        if (teacherEmail) emails.add(teacherEmail);
        const key = `${dayOfWeek}|${startTime}|${(className || "").toLowerCase()}|${subject.toLowerCase()}`;
        if (seenKeys.has(key)) { skipped++; errors.push({ row: line, field: "subject", message: `duplicate timetable slot for "${subject}" in file`, fatal: false }); continue; }
        seenKeys.add(key);
        items.push({ line, key, dayOfWeek, period: row.period?.trim() || null, startTime, endTime, subject, yearGroup: row.yearGroup?.trim() || null, className, room: row.room?.trim() || null, teacherEmail });
      } catch (err) { errors.push({ row: line, message: (err as Error).message, fatal: true }); }
    }
    const teachers = emails.size ? await prisma.user.findMany({ where: { email: { in: Array.from(emails) } }, select: { id: true, email: true } }) : [];
    const teacherByEmail = new Map(teachers.map((t) => [t.email.toLowerCase(), t.id] as const));
    const existingTt = await prisma.timetableEntry.findMany({ where: { schoolId }, select: { id: true, dayOfWeek: true, startTime: true, className: true, subject: true } });
    const ttByKey = new Map(existingTt.map((e) => [`${e.dayOfWeek}|${e.startTime}|${(e.className || "").toLowerCase()}|${e.subject.toLowerCase()}`, e.id] as const));
    const create: { schoolId: string; dayOfWeek: number; period: string | null; startTime: string; endTime: string; subject: string; yearGroup: string | null; className: string | null; room: string | null; teacherUserId: string | null; source: string }[] = [];
    for (const it of items) {
      const teacherUserId = it.teacherEmail ? (teacherByEmail.get(it.teacherEmail) ?? null) : null;
      if (it.teacherEmail && !teacherUserId) errors.push({ row: it.line, field: "teacherEmail", message: `teacher "${it.teacherEmail}" not found — slot imported unassigned`, fatal: false });
      const data = { period: it.period, endTime: it.endTime, subject: it.subject, yearGroup: it.yearGroup, room: it.room, teacherUserId, source: "import" };
      const id = ttByKey.get(it.key);
      if (id) { await prisma.timetableEntry.update({ where: { id }, data }); updated++; }
      else { create.push({ schoolId, dayOfWeek: it.dayOfWeek, startTime: it.startTime, className: it.className, ...data }); created++; }
    }
    for (let i = 0; i < create.length; i += 500) await prisma.timetableEntry.createMany({ data: create.slice(i, i + 500) });
  }

  // Behaviour records — append one merit/incident per row (match pupil by ref).
  if (type === "behaviour") {
    const pending: { line: number; ref: string; type: string; points: number; category: string | null; note: string | null; teacherName: string | null; positive: boolean; at: Date }[] = [];
    const refs = new Set<string>();
    const seenKeys = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const line = i + 2;
      const row = rows[i];
      try {
        const ref = row.studentReference?.trim();
        if (!ref) throw new Error("studentReference is required");
        const bt = (row.type?.trim() || "merit").toLowerCase();
        const pointsRaw = (row.points || "").trim();
        const points = pointsRaw ? parseInt(pointsRaw, 10) : 0;
        if (pointsRaw && isNaN(points)) throw new Error("points must be a whole number");
        const posRaw = (row.positive || "").trim();
        const positive = posRaw ? /^(1|true|yes|y|positive)$/i.test(posRaw) : !["incident", "detention", "sanction"].includes(bt);
        const atRaw = (row.at || row.date || "").trim();
        let at = new Date();
        if (atRaw) { if (!/^\d{4}-\d{2}-\d{2}$/.test(atRaw)) throw new Error("at must be YYYY-MM-DD"); at = new Date(`${atRaw}T00:00:00.000Z`); }
        const note = row.note?.trim() || null;
        const dupKey = `${ref.toLowerCase()}|${bt}|${atRaw}|${note || ""}`;
        if (seenKeys.has(dupKey)) { skipped++; errors.push({ row: line, field: "studentReference", message: `duplicate behaviour row for "${ref}" in file`, fatal: false }); continue; }
        seenKeys.add(dupKey);
        refs.add(ref);
        pending.push({ line, ref, type: bt, points, category: row.category?.trim() || null, note, teacherName: row.teacherName?.trim() || null, positive, at });
      } catch (err) { errors.push({ row: line, message: (err as Error).message, fatal: true }); }
    }
    const students = refs.size ? await prisma.student.findMany({ where: { schoolId, reference: { in: Array.from(refs) } }, select: { id: true, reference: true } }) : [];
    const idByRef = new Map(students.map((s) => [s.reference, s.id] as const));
    const create: { schoolId: string; studentId: string; type: string; points: number; category: string | null; note: string | null; teacherName: string | null; positive: boolean; at: Date; source: string }[] = [];
    for (const p of pending) {
      const studentId = idByRef.get(p.ref);
      if (!studentId) { errors.push({ row: p.line, field: "studentReference", message: `student "${p.ref}" not found`, fatal: true }); continue; }
      create.push({ schoolId, studentId, type: p.type, points: p.points, category: p.category, note: p.note, teacherName: p.teacherName, positive: p.positive, at: p.at, source: "import" });
      created++;
    }
    for (let i = 0; i < create.length; i += 500) await prisma.rewardRecord.createMany({ data: create.slice(i, i + 500), skipDuplicates: true });
  }

  // Knowledge base — one row per document, matched by title (per school).
  if (type === "knowledge_base") {
    const DOC_STATUS = ["draft", "under_review", "approved", "published", "superseded", "archived"];
    const items: { line: number; title: string; data: { description: string | null; category: string; sourceType: string; audienceRoles: string; bodyText: string; status: string; yearGroup: string | null } }[] = [];
    const titlesSeen = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const line = i + 2;
      const row = rows[i];
      try {
        const title = row.title?.trim();
        if (!title) throw new Error("title is required");
        if (titlesSeen.has(title.toLowerCase())) { skipped++; errors.push({ row: line, field: "title", message: `duplicate document "${title}" in file`, fatal: false }); continue; }
        titlesSeen.add(title.toLowerCase());
        const status = (row.status?.trim() || "draft").toLowerCase();
        items.push({ line, title, data: {
          description: row.description?.trim() || null,
          category: (row.category?.trim() || "faq").toLowerCase(),
          sourceType: (row.sourceType?.trim() || "text").toLowerCase(),
          audienceRoles: row.audienceRoles?.trim() || "parent,staff",
          bodyText: row.bodyText?.trim() || "",
          status: DOC_STATUS.includes(status) ? status : "draft",
          yearGroup: row.yearGroup?.trim() || null,
        } });
      } catch (err) { errors.push({ row: line, message: (err as Error).message, fatal: true }); }
    }
    const existingDocs = await prisma.document.findMany({ where: { schoolId }, select: { id: true, title: true } });
    const docByTitle = new Map(existingDocs.map((d) => [d.title.toLowerCase(), d.id] as const));
    const create: { schoolId: string; title: string; description: string | null; category: string; sourceType: string; audienceRoles: string; bodyText: string; status: string; yearGroup: string | null }[] = [];
    for (const it of items) {
      const id = docByTitle.get(it.title.toLowerCase());
      if (id) { await prisma.document.update({ where: { id }, data: it.data }); updated++; }
      else { create.push({ schoolId, title: it.title, ...it.data }); created++; }
    }
    for (let i = 0; i < create.length; i += 500) await prisma.document.createMany({ data: create.slice(i, i + 500) });
  }

  const BATCHED_TYPES = ["attendance", "clubs_activities", "timetables", "behaviour", "knowledge_base"];
  for (let i = 0; !BATCHED_TYPES.includes(type) && i < rows.length; i++) {
    const line = i + 2; // header is line 1
    const row = rows[i];
    try {
      if (type === "students") {
        const reference = row.reference?.trim();
        if (!reference) throw new Error("reference is required");
        if (!row.firstName?.trim() || !row.lastName?.trim())
          throw new Error("firstName and lastName are required");
        if (seen.has(reference)) {
          skipped++;
          errors.push({ row: line, field: "reference", message: `duplicate reference "${reference}" in file`, fatal: false });
          continue;
        }
        seen.add(reference);

        const status = (row.status?.trim() || "enrolled").toLowerCase();
        if (!STUDENT_STATUSES.includes(status as (typeof STUDENT_STATUSES)[number]))
          throw new Error(`status must be one of ${STUDENT_STATUSES.join(", ")}`);

        const classId = row.className?.trim()
          ? await upsertClass(schoolId, row.className.trim(), row.yearGroup?.trim())
          : null;

        const data = {
          firstName: row.firstName.trim(),
          lastName: row.lastName.trim(),
          preferredName: row.preferredName?.trim() || null,
          dateOfBirth: parseDate(row.dateOfBirth || "", "dateOfBirth"),
          yearGroup: row.yearGroup?.trim() || null,
          classId,
          house: row.house?.trim() || null,
          status,
          admissionDate: parseDate(row.admissionDate || "", "admissionDate"),
          medicalAlert: parseBool(row.medicalAlert || ""),
          sendIndicator: parseBool(row.sendIndicator || ""),
          transportEligible: parseBool(row.transportEligible || ""),
          allergies: row.allergies?.trim() || null,
          photoUrl: row.photoUrl?.trim() || null,
          source: "import",
        };

        const existing = await prisma.student.findUnique({
          where: { schoolId_reference: { schoolId, reference } },
        });
        if (existing) {
          await prisma.student.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await prisma.student.create({ data: { schoolId, reference, ...data } });
          created++;
        }
      } else if (type === "parents") {
        const email = row.email?.trim().toLowerCase();
        const fullName = row.fullName?.trim();
        if (!fullName) throw new Error("fullName is required");
        if (!email || !EMAIL_RE.test(email)) throw new Error("a valid email is required");

        const firstTime = !seen.has(email);
        seen.add(email);

        let user = await prisma.user.findUnique({ where: { email } });
        const contact = {
          fullName,
          phone: row.phone?.trim() || null,
          addressLine1: row.addressLine1?.trim() || null,
          city: row.city?.trim() || null,
          postcode: row.postcode?.trim() || null,
          preferredLanguage: row.preferredLanguage?.trim() || "en",
          ...(row.photoUrl?.trim() ? { photoUrl: row.photoUrl.trim() } : {}),
        };
        if (!user) {
          user = await prisma.user.create({
            data: { email, status: "invited", source: "import", ...contact },
          });
          created++;
        } else {
          await prisma.user.update({ where: { id: user.id }, data: contact });
          if (firstTime) updated++;
        }

        // Ensure a Parent membership in this school.
        await prisma.membership.upsert({
          where: { userId_schoolId_role: { userId: user.id, schoolId, role: ROLES.PARENT } },
          update: {},
          create: { userId: user.id, schoolId, role: ROLES.PARENT },
        });

        // Link to children by reference.
        const refs = (row.childReferences || "")
          .split(";")
          .map((r) => r.trim())
          .filter(Boolean);
        for (const ref of refs) {
          const student = await prisma.student.findUnique({
            where: { schoolId_reference: { schoolId, reference: ref } },
          });
          if (!student) {
            errors.push({ row: line, field: "childReferences", message: `student "${ref}" not found`, fatal: false });
            continue;
          }
          await prisma.guardianLink.upsert({
            where: { parentUserId_studentId: { parentUserId: user.id, studentId: student.id } },
            update: {
              relationship: row.relationship?.trim() || "Parent",
              collectionAuthorised: parseBool(row.collectionAuthorised || ""),
              isEmergencyContact: parseBool(row.isEmergencyContact || ""),
            },
            create: {
              schoolId,
              parentUserId: user.id,
              studentId: student.id,
              relationship: row.relationship?.trim() || "Parent",
              collectionAuthorised: parseBool(row.collectionAuthorised || ""),
              isEmergencyContact: parseBool(row.isEmergencyContact || ""),
            },
          });
        }
      } else if (type === "staff") {
        const reference = row.reference?.trim();
        const email = row.email?.trim().toLowerCase();
        const fullName = row.fullName?.trim();
        if (!reference) throw new Error("reference is required");
        if (!fullName) throw new Error("fullName is required");
        if (!email || !EMAIL_RE.test(email)) throw new Error("a valid email is required");
        if (seen.has(reference)) {
          skipped++;
          errors.push({ row: line, field: "reference", message: `duplicate reference "${reference}" in file`, fatal: false });
          continue;
        }
        seen.add(reference);

        const role = row.role?.trim() || ROLES.TEACHER;
        if (!SCHOOL_ROLES.includes(role as (typeof SCHOOL_ROLES)[number]))
          throw new Error(`role must be one of ${SCHOOL_ROLES.join(", ")}`);

        const photoUrl = row.photoUrl?.trim() || null;
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          user = await prisma.user.create({
            data: { email, fullName, status: "invited", ...(photoUrl ? { photoUrl } : {}) },
          });
          created++;
        } else {
          await prisma.user.update({ where: { id: user.id }, data: { fullName, ...(photoUrl ? { photoUrl } : {}) } });
          updated++;
        }

        await prisma.membership.upsert({
          where: { userId_schoolId_role: { userId: user.id, schoolId, role } },
          update: {},
          create: { userId: user.id, schoolId, role },
        });

        await prisma.staffProfile.upsert({
          where: { schoolId_userId: { schoolId, userId: user.id } },
          update: {
            reference,
            jobTitle: row.jobTitle?.trim() || null,
            department: row.department?.trim() || null,
            source: "import",
          },
          create: {
            schoolId,
            userId: user.id,
            reference,
            jobTitle: row.jobTitle?.trim() || null,
            department: row.department?.trim() || null,
            source: "import",
          },
        });

        const profile = await prisma.staffProfile.findUnique({
          where: { schoolId_userId: { schoolId, userId: user.id } },
        });
        const classNames = (row.classNames || "")
          .split(";")
          .map((c) => c.trim())
          .filter(Boolean);
        for (const cn of classNames) {
          const classId = await upsertClass(schoolId, cn);
          await prisma.staffClass.upsert({
            where: { staffProfileId_classId: { staffProfileId: profile!.id, classId } },
            update: {},
            create: { staffProfileId: profile!.id, classId },
          });
        }
      } else if (type === "messaging_consent") {
        // Seed SMS / WhatsApp consent a school already holds. This NEVER creates
        // a user — consent must attach to a known guardian, matched by email or
        // (failing that) the last 9 digits of a phone number. Every change is
        // written to the audit trail with its provenance, exactly like the
        // parent self-service and inbound-keyword paths.
        const email = row.email?.trim().toLowerCase() || "";
        const phoneRaw = row.phone?.trim() || "";
        if (!email && !phoneRaw) throw new Error("email or phone is required to match a guardian");
        if (email && !EMAIL_RE.test(email)) throw new Error("email is not valid");

        let user = email ? await prisma.user.findUnique({ where: { email } }) : null;
        if (!user && phoneRaw) {
          const digits = phoneRaw.replace(/[^\d]/g, "").slice(-9);
          if (digits.length >= 6) user = await prisma.user.findFirst({ where: { phone: { contains: digits } } });
        }
        if (!user) throw new Error(`no guardian found for "${email || phoneRaw}"`);

        const isParent = await prisma.membership.findFirst({
          where: { userId: user.id, schoolId, role: ROLES.PARENT },
        });
        if (!isParent) throw new Error(`"${email || phoneRaw}" is not a guardian at this school`);

        if (seen.has(user.id)) {
          skipped++;
          errors.push({ row: line, field: "email", message: `duplicate consent row for "${email || phoneRaw}" in file`, fatal: false });
          continue;
        }
        seen.add(user.id);

        const sms = parseTriBool(row.smsConsent);
        const wa = parseTriBool(row.whatsappConsent);
        if (sms === undefined && wa === undefined && !phoneRaw)
          throw new Error("nothing to apply: set smsConsent and/or whatsappConsent");

        const numberOnFile = phoneRaw || user.phone;
        const data: any = {};
        if (phoneRaw) data.phone = phoneRaw;
        if (sms === true && !numberOnFile) throw new Error("a phone number is required to enable SMS");
        if (wa === true && !numberOnFile) throw new Error("a phone number is required to enable WhatsApp");
        if (sms !== undefined) data.smsOptOut = !sms; // consent → clear opt-out
        if (wa !== undefined) {
          data.whatsappOptIn = wa;
          data.whatsappOptInAt = wa ? new Date() : null;
        }

        await prisma.user.update({ where: { id: user.id }, data });
        updated++;

        const provenance = {
          via: "bulk_import",
          source: row.consentSource?.trim() || "bulk_import",
          consentDate: row.consentDate?.trim() || null,
          numberChanged: !!phoneRaw,
        };
        if (wa !== undefined) {
          await recordAudit({
            action: wa ? AUDIT.WHATSAPP_OPT_IN : AUDIT.WHATSAPP_OPT_OUT,
            schoolId, actorUserId: opts.actorUserId, actorEmail: opts.actorEmail,
            targetType: "MessagingConsent", targetId: user.id,
            metadata: { ...provenance, channel: "whatsapp", optIn: wa },
          });
        }
        if (sms !== undefined) {
          await recordAudit({
            action: sms ? AUDIT.SMS_OPT_IN : AUDIT.SMS_OPT_OUT,
            schoolId, actorUserId: opts.actorUserId, actorEmail: opts.actorEmail,
            targetType: "MessagingConsent", targetId: user.id,
            metadata: { ...provenance, channel: "sms", optIn: sms },
          });
        }
      } else if (type === "vehicles") {
        const reference = row.reference?.trim();
        if (!reference) throw new Error("reference is required");
        if (seen.has("veh:" + reference)) { skipped++; errors.push({ row: line, field: "reference", message: `duplicate vehicle "${reference}" in file`, fatal: false }); continue; }
        seen.add("veh:" + reference);
        const capacity = row.capacity?.trim() ? parseInt(row.capacity.trim(), 10) : 16;
        if (isNaN(capacity) || capacity < 0) throw new Error("capacity must be a whole number");
        const data = {
          label: row.label?.trim() || null,
          capacity,
          type: (row.type?.trim() || "minibus").toLowerCase(),
          gpsSource: row.gpsSource?.trim() || "driver_phone",
          active: row.active?.trim() ? parseBool(row.active) : true,
        };
        const existing = await prisma.vehicle.findUnique({ where: { schoolId_reference: { schoolId, reference } } });
        if (existing) { await prisma.vehicle.update({ where: { id: existing.id }, data }); updated++; }
        else { await prisma.vehicle.create({ data: { schoolId, reference, ...data } }); created++; }
      } else if (type === "routes") {
        const name = row.name?.trim();
        if (!name) throw new Error("name is required");
        if (seen.has("rt:" + name.toLowerCase())) { skipped++; errors.push({ row: line, field: "name", message: `duplicate route "${name}" in file`, fatal: false }); continue; }
        seen.add("rt:" + name.toLowerCase());
        const cutoffTime = row.cutoffTime?.trim() || "07:00";
        if (!/^\d{2}:\d{2}$/.test(cutoffTime)) throw new Error("cutoffTime must be HH:MM");
        let vehicleId: string | null = null;
        const vref = row.vehicleReference?.trim();
        if (vref) {
          const v = await prisma.vehicle.findUnique({ where: { schoolId_reference: { schoolId, reference: vref } } });
          if (!v) errors.push({ row: line, field: "vehicleReference", message: `vehicle "${vref}" not found — import vehicles first`, fatal: false });
          else vehicleId = v.id;
        }
        const data = { type: (row.type?.trim() || "fixed").toLowerCase(), cutoffTime, active: row.active?.trim() ? parseBool(row.active) : true, vehicleId };
        const existing = await prisma.route.findFirst({ where: { schoolId, name } });
        if (existing) { await prisma.route.update({ where: { id: existing.id }, data }); updated++; }
        else { await prisma.route.create({ data: { schoolId, name, ...data } }); created++; }
      } else if (type === "drivers") {
        const email = row.email?.trim().toLowerCase();
        const fullName = row.fullName?.trim();
        if (!email || !EMAIL_RE.test(email)) throw new Error("a valid email is required");
        if (!fullName) throw new Error("fullName is required");
        if (seen.has("drv:" + email)) { skipped++; errors.push({ row: line, field: "email", message: `duplicate email "${email}" in file`, fatal: false }); continue; }
        seen.add("drv:" + email);
        const phone = row.phone?.trim() || null;
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) { user = await prisma.user.create({ data: { email, fullName, ...(phone ? { phone } : {}), status: "invited", source: "import" } }); created++; }
        else { await prisma.user.update({ where: { id: user.id }, data: { fullName, ...(phone ? { phone } : {}) } }); updated++; }
        await prisma.membership.upsert({ where: { userId_schoolId_role: { userId: user.id, schoolId, role: ROLES.DRIVER } }, update: {}, create: { userId: user.id, schoolId, role: ROLES.DRIVER } });
        const dp = { phone, licenceNumber: row.licenceNumber?.trim() || null, licenceClasses: row.licenceClasses?.trim() || null, licenceExpiry: row.licenceExpiry?.trim() || null, dbsExpiry: row.dbsExpiry?.trim() || null, medicalDue: row.medicalDue?.trim() || null, status: "active" };
        await prisma.driverProfile.upsert({ where: { userId: user.id }, update: dp, create: { schoolId, userId: user.id, ...dp } });
      } else if (type === "calendar_events") {
        const title = row.title?.trim();
        if (!title) throw new Error("title is required");
        const startsAt = parseDateTime(row.startsAt || "", "startsAt");
        const endsAt = parseDateTimeOpt(row.endsAt || "", "endsAt");
        const key = "ev:" + title.toLowerCase() + "@" + startsAt.toISOString();
        if (seen.has(key)) { skipped++; errors.push({ row: line, field: "title", message: `duplicate event "${title}" in file`, fatal: false }); continue; }
        seen.add(key);
        const yearGroup = row.yearGroup?.trim() || "";
        const className = row.className?.trim() || "";
        const classId = className ? await upsertClass(schoolId, className, yearGroup || undefined) : null;
        const data = {
          description: null as string | null,
          category: row.category?.trim() || "event",
          startsAt, endsAt,
          allDay: row.allDay?.trim() ? parseBool(row.allDay) : false,
          location: row.location?.trim() || null,
          audienceScope: classId ? "class" : yearGroup ? "year" : "school",
          yearGroup: yearGroup || null,
          classId,
          status: "published",
          source: "import",
          createdById: opts.actorUserId || null,
        };
        const existing = await prisma.calendarEvent.findFirst({ where: { schoolId, title, startsAt } });
        if (existing) { await prisma.calendarEvent.update({ where: { id: existing.id }, data }); updated++; }
        else { await prisma.calendarEvent.create({ data: { schoolId, title, ...data } }); created++; }
      } else if (type === "announcements") {
        const title = row.title?.trim();
        const body = row.body?.trim();
        if (!title) throw new Error("title is required");
        if (!body) throw new Error("body is required");
        if (seen.has("an:" + title.toLowerCase())) { skipped++; errors.push({ row: line, field: "title", message: `duplicate announcement "${title}" in file`, fatal: false }); continue; }
        seen.add("an:" + title.toLowerCase());
        const audienceKind = (row.audienceKind?.trim() || "all").toLowerCase();
        const chans = (row.channels || "inapp").split(/[;,]/).map((c) => c.trim().toLowerCase()).filter((c) => ["inapp", "email", "whatsapp", "sms"].includes(c));
        await prisma.announcement.create({
          data: {
            schoolId, title, body,
            audienceKind: ["all", "year", "class", "list"].includes(audienceKind) ? audienceKind : "all",
            channelsJson: JSON.stringify(chans.length ? chans : ["inapp"]),
            status: "draft", // imported announcements are always drafts you review + send
            createdById: opts.actorUserId || null,
          },
        });
        created++;
      } else if (type === "pupil_reports") {
        const ref = row.studentReference?.trim();
        const title = row.title?.trim();
        if (!ref) throw new Error("studentReference is required");
        if (!title) throw new Error("title is required");
        const student = await prisma.student.findUnique({ where: { schoolId_reference: { schoolId, reference: ref } } });
        if (!student) throw new Error(`student "${ref}" not found`);
        const term = row.term?.trim() || null;
        const dupKey = "pr:" + student.id + ":" + title.toLowerCase() + ":" + (term || "");
        if (seen.has(dupKey)) { skipped++; errors.push({ row: line, field: "title", message: `duplicate report "${title}" for this pupil in file`, fatal: false }); continue; }
        seen.add(dupKey);
        const data = { type: (row.type?.trim() || "termly").toLowerCase(), title, term, summary: row.summary?.trim() || null, status: "draft", source: "import", authorId: opts.actorUserId || null };
        const existing = await prisma.studentReport.findFirst({ where: { schoolId, studentId: student.id, title, term } });
        if (existing) { await prisma.studentReport.update({ where: { id: existing.id }, data }); updated++; }
        else { await prisma.studentReport.create({ data: { schoolId, studentId: student.id, ...data } }); created++; }
      } else if (type === "menus") {
        const name = row.name?.trim();
        if (!name) throw new Error("name is required");
        const day = (row.day?.trim() || "Mon");
        const meal = (row.meal?.trim() || "lunch").toLowerCase();
        const course = (row.course?.trim() || "main").toLowerCase();
        const priceRaw = (row.price || "").replace(/[£,\s]/g, "").trim();
        const price = priceRaw ? Math.round(parseFloat(priceRaw) * 100) : 0;
        if (priceRaw && (isNaN(price) || price < 0)) throw new Error("price must be a number in pounds, e.g. 2.50");
        const dupKey = "menu:" + day.toLowerCase() + ":" + meal + ":" + course + ":" + name.toLowerCase();
        if (seen.has(dupKey)) { skipped++; errors.push({ row: line, field: "name", message: `duplicate menu item "${name}" in file`, fatal: false }); continue; }
        seen.add(dupKey);
        const data = {
          day, meal, course,
          weekOf: row.weekOf?.trim() || null,
          yearGroup: row.yearGroup?.trim() || null,
          className: row.className?.trim() || null,
          description: row.description?.trim() || null,
          allergens: row.allergens?.trim() || null,
          vegetarian: row.vegetarian?.trim() ? parseBool(row.vegetarian) : false,
          vegan: row.vegan?.trim() ? parseBool(row.vegan) : false,
          price,
          active: row.active?.trim() ? parseBool(row.active) : true,
          source: "import",
        };
        const existing = await prisma.menuItem.findFirst({ where: { schoolId, day, meal, course, name } });
        if (existing) { await prisma.menuItem.update({ where: { id: existing.id }, data }); updated++; }
        else { await prisma.menuItem.create({ data: { schoolId, name, ...data } }); created++; }
      } else if (type === "trips") {
        const title = row.title?.trim();
        if (!title) throw new Error("title is required");
        const date = (row.date || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
        const dupKey = "trip:" + title.toLowerCase() + "@" + date;
        if (seen.has(dupKey)) { skipped++; errors.push({ row: line, field: "title", message: `duplicate trip "${title}" in file`, fatal: false }); continue; }
        seen.add(dupKey);
        const status = (row.status?.trim() || "planned").toLowerCase();
        const data = {
          date,
          destination: row.destination?.trim() || null,
          departureTime: row.departureTime?.trim() || null,
          returnTime: row.returnTime?.trim() || null,
          purpose: row.purpose?.trim() || null,
          venue: row.venue?.trim() || null,
          status: ["planned", "active", "completed", "cancelled"].includes(status) ? status : "planned",
          source: "import",
          createdById: opts.actorUserId || null,
        };
        const existing = await prisma.trip.findFirst({ where: { schoolId, title, date } });
        if (existing) { await prisma.trip.update({ where: { id: existing.id }, data }); updated++; }
        else { await prisma.trip.create({ data: { schoolId, title, ...data } }); created++; }
      }
    } catch (err) {
      errors.push({ row: line, message: (err as Error).message, fatal: true });
    }
  }

  const errorRows = errors.filter((e) => e.fatal).length;
  const total = rows.length;
  const status: ImportResult["status"] =
    errorRows === 0 && errors.length === 0
      ? "completed"
      : created + updated > 0
      ? "partial"
      : "failed";

  const batch = await prisma.importBatch.create({
    data: {
      schoolId,
      type,
      filename: opts.filename || null,
      status,
      totalRows: total,
      createdRows: created,
      updatedRows: updated,
      skippedRows: skipped,
      errorRows,
      errorReport: JSON.stringify(errors),
      createdById: opts.actorUserId || null,
    },
  });

  await recordAudit({
    action: type === "messaging_consent" ? AUDIT.CONSENT_IMPORT : AUDIT.DATA_IMPORT,
    schoolId,
    actorUserId: opts.actorUserId,
    actorEmail: opts.actorEmail,
    targetType: "ImportBatch",
    targetId: batch.id,
    metadata: { type, total, created, updated, skipped, errorRows },
  });

  return {
    batchId: batch.id,
    status,
    totalRows: total,
    createdRows: created,
    updatedRows: updated,
    skippedRows: skipped,
    errorRows,
    errors,
  };
}
