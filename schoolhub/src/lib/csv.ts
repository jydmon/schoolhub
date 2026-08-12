// Dependency-free CSV utilities (the npm registry isn't always reachable, and a
// correct small parser is cheap). Handles quoted fields, escaped quotes (""),
// embedded commas/newlines, CRLF, and a leading BOM.

export type CsvTable = { headers: string[]; rows: Record<string, string>[] };

export function parseCsv(input: string): CsvTable {
  const text = input.replace(/^﻿/, ""); // strip BOM
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // Handle CRLF as one break; ignore a lone \r followed by \n.
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      // Skip fully blank lines.
      if (record.length > 1 || record[0] !== "") records.push(record);
      record = [];
    } else {
      field += c;
    }
  }
  // Flush trailing field/record.
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    if (record.length > 1 || record[0] !== "") records.push(record);
  }

  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < records.length; r++) {
    const cells = records[r];
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? "").trim();
    });
    rows.push(obj);
  }
  return { headers, rows };
}

export function toCsv(headers: string[], rows: (string | number | boolean)[][]): string {
  const esc = (v: string | number | boolean) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const row of rows) lines.push(row.map(esc).join(","));
  return lines.join("\r\n");
}

// ---- Templates (headers + one example row) ----

export const IMPORT_TEMPLATES: Record<
  string,
  { headers: string[]; example: (string | number | boolean)[] }
> = {
  students: {
    headers: [
      "reference",
      "firstName",
      "lastName",
      "preferredName",
      "dateOfBirth",
      "yearGroup",
      "className",
      "house",
      "status",
      "admissionDate",
      "medicalAlert",
      "sendIndicator",
      "transportEligible",
      "allergies",
      "photoUrl",
    ],
    example: ["STU-1001", "Ella", "Blake", "Ellie", "2016-04-12", "Year 4", "4B", "Oak", "enrolled", "2020-09-01", "false", "false", "true", "peanuts, dairy", "https://…/ella.jpg"],
  },
  parents: {
    headers: [
      "fullName",
      "email",
      "phone",
      "addressLine1",
      "city",
      "postcode",
      "preferredLanguage",
      "relationship",
      "childReferences",
      "collectionAuthorised",
      "isEmergencyContact",
      "photoUrl",
    ],
    example: ["Sarah Blake", "sarah@parents.test", "07700 900001", "1 High St", "Manchester", "M1 1AA", "en", "Mother", "STU-1001;STU-1002", "true", "true", "https://…/sarah.jpg"],
  },
  staff: {
    headers: ["reference", "fullName", "email", "role", "jobTitle", "department", "classNames", "photoUrl"],
    example: ["STF-2001", "Tom Reed", "tom@northwind.test", "Teacher", "Class Teacher", "Lower School", "4B;4C", "https://…/tom.jpg"],
  },
  messaging_consent: {
    // Seed messaging consent a school has already collected (paper/portal forms).
    // Match an existing guardian by email or phone; set SMS + WhatsApp consent.
    // "consentSource"/"consentDate" are recorded on the audit trail for provenance.
    headers: ["email", "phone", "smsConsent", "whatsappConsent", "consentSource", "consentDate"],
    example: ["sarah@parents.test", "07700 900001", "yes", "yes", "September enrolment form", "2026-09-01"],
  },
  // ---- Modules that schools without an existing system can seed by import ----
  vehicles: {
    // Transport fleet. Matched/updated by reference (registration or fleet no.).
    headers: ["reference", "label", "capacity", "type", "gpsSource", "active"],
    example: ["MB-01", "Minibus 1", 16, "minibus", "driver_phone", "true"],
  },
  routes: {
    // Transport routes. Optionally link a vehicle by its reference. Matched by name.
    headers: ["name", "type", "vehicleReference", "cutoffTime", "active"],
    example: ["Route A — North", "fixed", "MB-01", "07:00", "true"],
  },
  calendar_events: {
    // Calendar & timetable entries. Dates are "YYYY-MM-DD HH:MM" (24h). Leave
    // className/yearGroup blank for whole-school. Matched by title + start time.
    headers: ["title", "category", "startsAt", "endsAt", "allDay", "location", "yearGroup", "className"],
    example: ["Year 4 Swimming", "timetable_change", "2026-09-10 09:00", "2026-09-10 10:00", "false", "Pool", "Year 4", "4B"],
  },
  announcements: {
    // Parent announcements, created as drafts you review and send. Channels are
    // semicolon-separated from: inapp;email;whatsapp;sms.
    headers: ["title", "body", "audienceKind", "channels"],
    example: ["Welcome back", "Term starts Monday 8:45am.", "all", "inapp;email"],
  },
  pupil_reports: {
    // Pupil reports, created as drafts. Match the pupil by their student reference.
    headers: ["studentReference", "type", "title", "term", "summary"],
    example: ["STU-1001", "termly", "Autumn 2026 — Progress", "Autumn 2026", "On track across all subjects."],
  },
  menus: {
    // Canteen menu. Menus change weekly, so set weekOf (Mon date). "price" is in
    // pounds (2.50). Leave yearGroup blank for whole-school. veg/vegan are yes/no.
    headers: ["weekOf", "day", "yearGroup", "meal", "course", "name", "description", "allergens", "vegetarian", "vegan", "price", "active"],
    example: ["2026-09-07", "Mon", "Year 4", "lunch", "main", "Roast chicken & potatoes", "Served with seasonal vegetables", "gluten,milk", "no", "no", "2.50", "true"],
  },
  trips: {
    // Trips & events (event-tracking). Created as "planned"; live update buttons
    // are added per trip in the app. Matched by title + date. Dates are YYYY-MM-DD.
    headers: ["title", "date", "destination", "departureTime", "returnTime", "purpose", "venue", "status"],
    example: ["Ecomuseum trip — Year 4", "2026-09-18", "Ecomuseum", "08:30", "15:00", "Curriculum enrichment", "Ecomuseum", "planned"],
  },
  attendance: {
    // Daily attendance. Match a pupil by student reference. session = am|pm|day.
    // status = present|late|authorised|unauthorised|excused|absent. Date is YYYY-MM-DD.
    headers: ["studentReference", "date", "session", "status", "note"],
    example: ["STU-1001", "2026-09-08", "am", "present", ""],
  },
};
