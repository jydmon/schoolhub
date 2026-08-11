// Calendar helpers: audience resolution, ICS (iCalendar) generation and
// add-to-calendar deep links for Google / Outlook. Pure functions — no deps.

export type EventLike = {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date | string;
  endsAt?: Date | string | null;
  allDay?: boolean;
  reminderOffsets?: string | number[] | null; // JSON string or array of minutes
};

export type StudentLike = {
  id: string;
  yearGroup?: string | null;
  classId?: string | null;
  house?: string | null;
};

export type EventAudience = {
  audienceScope: string;
  yearGroup?: string | null;
  classId?: string | null;
  house?: string | null;
};

/** Does an event apply to a given student? `explicit` = student ids explicitly on the event. */
export function studentMatchesEvent(student: StudentLike, ev: EventAudience, explicit: Set<string>): boolean {
  if (explicit.has(student.id)) return true;
  switch (ev.audienceScope) {
    case "school": return true;
    case "year": return !!ev.yearGroup && ev.yearGroup === student.yearGroup;
    case "class": return !!ev.classId && ev.classId === student.classId;
    case "house": return !!ev.house && ev.house === student.house;
    case "club": return false; // club events reach explicitly-listed students only
    case "students": return false; // handled by `explicit` above
    default: return true;
  }
}

// ---- ICS ----

function pad(n: number) { return String(n).padStart(2, "0"); }

function toUtcStamp(d: Date, allDay = false): string {
  if (allDay) return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function escICS(s: string): string {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function reminderMinutes(v: EventLike["reminderOffsets"]): number[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; } }
  return [];
}

/** Build a full VCALENDAR document for one or more events. */
export function toICS(events: EventLike[], opts: { calName?: string; stamp?: Date } = {}): string {
  const now = opts.stamp ?? new Date();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SchoolHub//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escICS(opts.calName ?? "SchoolHub")}`,
  ];
  for (const e of events) {
    const start = new Date(e.startsAt);
    const end = e.endsAt ? new Date(e.endsAt) : new Date(start.getTime() + 60 * 60 * 1000);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.id}@schoolhub`);
    lines.push(`DTSTAMP:${toUtcStamp(now)}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${toUtcStamp(start, true)}`);
      lines.push(`DTEND;VALUE=DATE:${toUtcStamp(new Date(end.getTime() + 24 * 3600 * 1000), true)}`);
    } else {
      lines.push(`DTSTART:${toUtcStamp(start)}`);
      lines.push(`DTEND:${toUtcStamp(end)}`);
    }
    lines.push(`SUMMARY:${escICS(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escICS(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escICS(e.location)}`);
    for (const mins of reminderMinutes(e.reminderOffsets)) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escICS(e.title)}`, `TRIGGER:-PT${mins}M`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  // RFC5545 wants CRLF line endings.
  return lines.join("\r\n");
}

// ---- Add-to-calendar deep links ----

function gcalStamp(d: Date, allDay = false) { return toUtcStamp(d, allDay); }

export function googleCalUrl(e: EventLike): string {
  const start = new Date(e.startsAt);
  const end = e.endsAt ? new Date(e.endsAt) : new Date(start.getTime() + 3600 * 1000);
  const dates = e.allDay
    ? `${gcalStamp(start, true)}/${gcalStamp(new Date(end.getTime() + 24 * 3600 * 1000), true)}`
    : `${gcalStamp(start)}/${gcalStamp(end)}`;
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates,
    details: e.description ?? "",
    location: e.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export function outlookCalUrl(e: EventLike): string {
  const start = new Date(e.startsAt);
  const end = e.endsAt ? new Date(e.endsAt) : new Date(start.getTime() + 3600 * 1000);
  const p = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: e.title,
    body: e.description ?? "",
    location: e.location ?? "",
    startdt: start.toISOString(),
    enddt: end.toISOString(),
  });
  if (e.allDay) p.set("allday", "true");
  return `https://outlook.office.com/calendar/0/deeplink/compose?${p.toString()}`;
}
