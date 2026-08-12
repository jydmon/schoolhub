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

  for (let i = 0; i < rows.length; i++) {
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
