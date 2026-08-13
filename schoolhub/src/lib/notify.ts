import { prisma } from "./db";
import { sendEmail } from "./email";
import { sendSms } from "./sms";
import { sendWhatsApp } from "./whatsapp";
import { ROLES } from "./constants";

// Notification-centre engine: preferences, targeting resolution, channel fan-out
// and delivery tracking. In-app is real; push / SMS / email are simulated
// adapters (they log) unless real providers are wired — consistent with the rest
// of the scaffold. Safety-critical (emergency) messages override preferences and
// quiet hours.

const STAFF_ROLES: string[] = [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.TEACHER, ROLES.TRANSPORT_MANAGER, ROLES.SUPPORT_STAFF];

// User-facing notification categories. "security" is always on and cannot be
// disabled. Message `kind`s are mapped to these via categoryForKind().
export const NOTIFICATION_CATEGORIES: [string, string][] = [
  ["transport", "Transport updates"],
  ["checkinout", "Student check-in / check-out"],
  ["announcements", "School announcements"],
  ["timetable", "Timetable changes"],
  ["messages", "Messages"],
  ["rewards", "Rewards & achievements"],
  ["trips", "Trip notifications"],
  ["security", "Security alerts"],
];

export type Prefs = {
  channels: Record<string, boolean>;
  categories: Record<string, boolean>;
  digest: string;
  quietStart?: string | null;
  quietEnd?: string | null;
  preferredLanguage: string;
  perChild: Record<string, any>;
  rewardPrefs: Record<string, boolean>;
};

const DEFAULT_CATEGORIES: Record<string, boolean> = {
  transport: true, checkinout: true, announcements: true, timetable: true,
  messages: true, rewards: true, trips: true, security: true,
};

const DEFAULT_PREFS: Prefs = {
  channels: { inapp: true, push: true, email: true, sms: false, whatsapp: false },
  categories: { ...DEFAULT_CATEGORIES },
  digest: "immediate", quietStart: null, quietEnd: null, preferredLanguage: "en", perChild: {},
  rewardPrefs: { immediatePositive: true, dailySummary: false, weeklySummary: true, incident: true, detention: true, milestone: true },
};

export async function getPrefs(userId: string): Promise<Prefs> {
  const p = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (!p) return { ...DEFAULT_PREFS, categories: { ...DEFAULT_CATEGORIES } };
  const safe = (s: string | null | undefined, d: any) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
  // Merge stored prefs over defaults so an empty "{}" (or a partial object) falls
  // back to sensible defaults for any missing keys.
  return {
    channels: { ...DEFAULT_PREFS.channels, ...safe(p.channelsJson, {}) },
    categories: { ...DEFAULT_CATEGORIES, ...safe((p as any).categoriesJson, {}), security: true },
    digest: p.digest, quietStart: p.quietStart, quietEnd: p.quietEnd, preferredLanguage: p.preferredLanguage,
    perChild: safe(p.perChildJson, {}), rewardPrefs: { ...DEFAULT_PREFS.rewardPrefs, ...safe(p.rewardPrefsJson, {}) },
  };
}

/** Map a notification `kind` to a preference category. */
export function categoryForKind(kind?: string | null): string {
  const k = (kind || "").toLowerCase();
  if (k.includes("transport") || k.includes("journey") || k.includes("bus") || k.includes("route")) return "transport";
  if (k.includes("board") || k.includes("checkin") || k.includes("check-in") || k.includes("pickup") || k.includes("dropoff")) return "checkinout";
  if (k.includes("announce") || k.includes("newsletter")) return "announcements";
  if (k.includes("timetable") || k.includes("lesson")) return "timetable";
  if (k.includes("message") || k.includes("chat")) return "messages";
  if (k.includes("reward") || k.includes("behaviour") || k.includes("merit") || k.includes("achievement")) return "rewards";
  if (k.includes("trip") || k.includes("event")) return "trips";
  if (k.includes("security") || k.includes("login") || k.includes("password") || k.includes("mfa")) return "security";
  return "announcements";
}

/** Whether a user wants notifications for a category (security is always on). */
export function categoryEnabled(prefs: Prefs, category: string): boolean {
  if (category === "security") return true;
  return prefs.categories?.[category] !== false;
}

function withinQuiet(p: Prefs, now = new Date()): boolean {
  if (!p.quietStart || !p.quietEnd) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = p.quietStart.split(":").map(Number);
  const [eh, em] = p.quietEnd.split(":").map(Number);
  const s = sh * 60 + sm, e = eh * 60 + em;
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e; // handle overnight ranges
}

// ---- channel adapters ----
type DeliverResult = { status: "sent" | "failed"; providerId?: string };

export async function deliver(channel: string, userId: string, title: string, body?: string, emergency = false): Promise<DeliverResult> {
  if (channel === "email") {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!u?.email) return { status: "failed" };
    await sendEmail({ to: u.email, subject: title, body: body || "" });
    return { status: "sent" };
  }

  if (channel === "push") {
    const devices = await prisma.device.findMany({ where: { userId }, select: { pushToken: true, platform: true } });
    if (devices.length === 0) return { status: "failed" };
    for (const d of devices) {
      // eslint-disable-next-line no-console
      console.log(`[push:${d.platform}] token=${d.pushToken.slice(0, 12)}… → ${title}`);
    }
    return { status: "sent" };
  }

  if (channel === "sms" || channel === "whatsapp") {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true, smsOptOut: true, whatsappOptIn: true } });
    if (!user?.phone) return { status: "failed" };

    if (channel === "sms") {
      if (user.smsOptOut && !emergency) return { status: "failed" };
      const r = await sendSms(user.phone, body ? `${title} — ${body}` : title);
      return { status: r.status, providerId: r.providerId };
    }
    if (!user.whatsappOptIn) return { status: "failed" };
    const r = emergency
      ? await sendWhatsApp(user.phone, { kind: "text", body: body ? `${title}: ${body}` : title })
      : await sendWhatsApp(user.phone, { kind: "template", template: "general_update", variables: [title, body || ""] });
    return { status: r.status, providerId: r.providerId };
  }

  // eslint-disable-next-line no-console
  console.log(`[notify:${channel}] → user ${userId}: ${title}`);
  return { status: "sent" };
}

/** Resolve a targeting spec to recipient user ids (guardians and/or staff). */
export async function resolveRecipients(schoolId: string, target: { type: string; value?: string; audience?: string }): Promise<string[]> {
  const parents = new Set<string>();
  const staff = new Set<string>();

  const addGuardiansOf = async (studentIds: string[]) => {
    if (!studentIds.length) return;
    const links = await prisma.guardianLink.findMany({ where: { studentId: { in: studentIds } }, select: { parentUserId: true } });
    links.forEach((l) => parents.add(l.parentUserId));
  };
  const addAllStaff = async () => {
    const ms = await prisma.membership.findMany({ where: { schoolId, role: { in: STAFF_ROLES } }, select: { userId: true } });
    ms.forEach((m) => staff.add(m.userId));
  };

  const studentsWhere: any = { schoolId };
  switch (target.type) {
    case "school": break;
    case "campus": studentsWhere.campusId = target.value; break;
    case "year": studentsWhere.yearGroup = target.value; break;
    case "class": studentsWhere.classId = target.value; break;
    case "house": studentsWhere.house = target.value; break;
    case "student": studentsWhere.id = target.value; break;
    case "route": studentsWhere.transportProfile = { routeId: target.value }; break;
    case "vehicle": studentsWhere.transportProfile = { vehicleId: target.value }; break;
    case "trip": {
      const ts = await prisma.tripStudent.findMany({ where: { tripId: target.value }, select: { studentId: true } });
      await addGuardiansOf(ts.map((t) => t.studentId));
      const tstaff = await prisma.tripStaff.findMany({ where: { tripId: target.value }, select: { userId: true } });
      tstaff.forEach((t) => staff.add(t.userId));
      break;
    }
    case "staff": await addAllStaff(); break;
    case "parents": break;
    case "club": break;
  }

  if (!["trip", "staff"].includes(target.type)) {
    const students = await prisma.student.findMany({ where: studentsWhere, select: { id: true } });
    await addGuardiansOf(students.map((s) => s.id));
  }

  const audience = target.audience || (target.type === "staff" ? "staff" : target.type === "school" ? "both" : "parents");
  if (audience === "staff") return Array.from(staff);
  if (audience === "both") { if (staff.size === 0) await addAllStaff(); return Array.from(new Set([...parents, ...staff])); }
  return Array.from(parents);
}

/** Fan a message out to recipients across channels, honouring prefs (unless emergency). */
export async function dispatch(msg: { id: string; schoolId: string; title: string; body?: string | null; channels: string; priority: string; kind?: string }, userIds: string[]) {
  const channels = msg.channels.split(",").map((c) => c.trim()).filter(Boolean);
  const emergency = msg.priority === "emergency";
  const category = categoryForKind(msg.kind || "message");
  const now = new Date();
  const rows: any[] = [];

  for (const userId of userIds) {
    const prefs = emergency ? DEFAULT_PREFS : await getPrefs(userId);
    const wantsCategory = emergency || categoryEnabled(prefs, category);
    const quiet = emergency ? false : withinQuiet(prefs, now);
    // In-app is always recorded; external channels honour channel + category prefs.
    const chosen = emergency ? channels : channels.filter((c) => c === "inapp" || (prefs.channels[c] && wantsCategory));
    for (const ch of chosen) {
      let status = "delivered";
      let providerId: string | undefined;
      if (ch !== "inapp") {
        if (quiet) { status = "queued"; }
        else { const r = await deliver(ch, userId, msg.title, msg.body || undefined, emergency); status = r.status; providerId = r.providerId; }
      }
      rows.push({ userId, schoolId: msg.schoolId, messageId: msg.id, kind: msg.kind || "message", title: msg.title, body: msg.body || null, channel: ch, status, providerId: providerId ?? null });
    }
  }
  if (rows.length) await prisma.notification.createMany({ data: rows });
  await prisma.message.update({ where: { id: msg.id }, data: { recipientCount: userIds.length } });
  return { recipients: userIds.length, notifications: rows.length };
}
