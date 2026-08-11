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

export type Prefs = {
  channels: Record<string, boolean>;
  digest: string;
  quietStart?: string | null;
  quietEnd?: string | null;
  preferredLanguage: string;
  perChild: Record<string, any>;
  rewardPrefs: Record<string, boolean>;
};

const DEFAULT_PREFS: Prefs = {
  channels: { inapp: true, push: true, email: true, sms: false, whatsapp: false },
  digest: "immediate", quietStart: null, quietEnd: null, preferredLanguage: "en", perChild: {},
  rewardPrefs: { immediatePositive: true, dailySummary: false, weeklySummary: true, incident: true, detention: true, milestone: true },
};

export async function getPrefs(userId: string): Promise<Prefs> {
  const p = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (!p) return DEFAULT_PREFS;
  const safe = (s: string, d: any) => { try { return JSON.parse(s); } catch { return d; } };
  // Merge stored prefs over defaults so an empty "{}" (or a partial object) falls
  // back to sensible defaults for any missing keys.
  return {
    channels: { ...DEFAULT_PREFS.channels, ...safe(p.channelsJson, {}) },
    digest: p.digest, quietStart: p.quietStart, quietEnd: p.quietEnd, preferredLanguage: p.preferredLanguage,
    perChild: safe(p.perChildJson, {}), rewardPrefs: { ...DEFAULT_PREFS.rewardPrefs, ...safe(p.rewardPrefsJson, {}) },
  };
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
// In-app is real (a Notification row). email/push/sms/whatsapp use adapters that
// log in console-mode and swap to real providers via env (see each lib). Push
// targets the user's *registered devices* (Device rows). SMS honours opt-out;
// WhatsApp requires opt-in and uses an approved template for business-initiated
// (non-emergency) messages — so delivery tracking reflects real consent state.
type DeliverResult = { status: "sent" | "failed"; providerId?: string };

export async function deliver(channel: string, userId: string, title: string, body?: string, emergency = false): Promise<DeliverResult> {
  if (channel === "email") {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!u?.email) return { status: "failed" }; // no address on file
    await sendEmail({ to: u.email, subject: title, body: body || "" });
    return { status: "sent" };
  }

  if (channel === "push") {
    const devices = await prisma.device.findMany({ where: { userId }, select: { pushToken: true, platform: true } });
    if (devices.length === 0) return { status: "failed" }; // no registered device
    for (const d of devices) {
      // eslint-disable-next-line no-console
      console.log(`[push:${d.platform}] token=${d.pushToken.slice(0, 12)}… → ${title}`); // → FCM/APNs
    }
    return { status: "sent" };
  }

  if (channel === "sms" || channel === "whatsapp") {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true, smsOptOut: true, whatsappOptIn: true } });
    if (!user?.phone) return { status: "failed" }; // no number on file

    if (channel === "sms") {
      if (user.smsOptOut && !emergency) return { status: "failed" }; // replied STOP (emergencies still go)
      const r = await sendSms(user.phone, body ? `${title} — ${body}` : title);
      return { status: r.status, providerId: r.providerId };
    }
    // whatsapp
    if (!user.whatsappOptIn) return { status: "failed" }; // must opt in before we may message
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
    case "parents": break; // all guardians in school
    case "club": break; // resolved via events in a later iteration
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
export async function dispatch(msg: { id: string; schoolId: string; title: string; body?: string | null; channels: string; priority: string }, userIds: string[]) {
  const channels = msg.channels.split(",").map((c) => c.trim()).filter(Boolean);
  const emergency = msg.priority === "emergency";
  const now = new Date();
  const rows: any[] = [];

  for (const userId of userIds) {
    const prefs = emergency ? DEFAULT_PREFS : await getPrefs(userId);
    const quiet = emergency ? false : withinQuiet(prefs, now);
    const chosen = emergency ? channels : channels.filter((c) => c === "inapp" || prefs.channels[c]);
    for (const ch of chosen) {
      let status = "delivered";
      let providerId: string | undefined;
      if (ch !== "inapp") {
        if (quiet) { status = "queued"; }
        else { const r = await deliver(ch, userId, msg.title, msg.body || undefined, emergency); status = r.status; providerId = r.providerId; }
      }
      rows.push({ userId, schoolId: msg.schoolId, messageId: msg.id, kind: "message", title: msg.title, body: msg.body || null, channel: ch, status, providerId: providerId ?? null });
    }
  }
  if (rows.length) await prisma.notification.createMany({ data: rows });
  await prisma.message.update({ where: { id: msg.id }, data: { recipientCount: userIds.length } });
  return { recipients: userIds.length, notifications: rows.length };
}
