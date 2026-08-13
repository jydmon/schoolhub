/* ------------------------------------------------------------------ *
 * SIPlat demo data — mirrors the web/mobile design demo so every screen
 * renders instantly without a live backend. Swap these for live API
 * calls (src/api/client.ts) when the mobile endpoints are ready.
 * ------------------------------------------------------------------ */

export type RoleKey = "parent" | "teacher" | "driver" | "admin" | "student";
export type TabDef = { key: string; label: string; icon: string };

export const APPS: Record<RoleKey, { title: string; school: string; who: string; av: string; em: string; tabs: TabDef[] }> = {
  parent: {
    title: "Parent", school: "Northwind Academy", who: "Sarah Blake", av: "SB", em: "👪",
    tabs: [
      { key: "assistant", label: "Assistant", icon: "✨" },
      { key: "home", label: "Home", icon: "🏠" },
      { key: "calendar", label: "Calendar", icon: "📅" },
      { key: "transport", label: "Transport", icon: "🚌" },
      { key: "reports", label: "Reports", icon: "📄" },
      { key: "alerts", label: "Alerts", icon: "🔔" },
      { key: "messaging", label: "Messages", icon: "💬" },
    ],
  },
  teacher: {
    title: "Teacher", school: "Northwind Academy", who: "Tom Reed", av: "TR", em: "🍎",
    tabs: [
      { key: "assistant", label: "Assistant", icon: "✨" },
      { key: "trips", label: "Trips", icon: "🧭" },
      { key: "reports", label: "Reports", icon: "📝" },
      { key: "account", label: "Account", icon: "⚙️" },
    ],
  },
  driver: {
    title: "Driver", school: "Northwind Academy", who: "Dan Cole", av: "DC", em: "🚌",
    tabs: [
      { key: "journeys", label: "Journeys", icon: "🚌" },
      { key: "account", label: "Account", icon: "⚙️" },
    ],
  },
  admin: {
    title: "Admin", school: "Northwind Academy", who: "Alice Turner", av: "AT", em: "🛠️",
    tabs: [
      { key: "assistant", label: "Assistant", icon: "✨" },
      { key: "operations", label: "Operations", icon: "📊" },
      { key: "emergency", label: "Emergency", icon: "🚨" },
      { key: "integrations", label: "Links", icon: "🔌" },
      { key: "account", label: "Account", icon: "⚙️" },
    ],
  },
  student: {
    title: "Student", school: "Northwind Academy", who: "Ella Blake", av: "EB", em: "🎒",
    tabs: [
      { key: "day", label: "My day", icon: "🎒" },
      { key: "timetable", label: "Timetable", icon: "📅" },
      { key: "homework", label: "Homework", icon: "📚" },
      { key: "reports", label: "Reports", icon: "📄" },
      { key: "account", label: "Account", icon: "⚙️" },
    ],
  },
};

export type InboxItem = { id: string; t: string; m: string; tag: string; read: boolean };
export const MOBILE_INBOX: Partial<Record<RoleKey, InboxItem[]>> = {
  parent: [
    { id: "m1", t: "Sports Day — Friday 09:30", m: "Gates open 09:15 · water bottle + sun cream", tag: "event", read: false },
    { id: "m2", t: "Ecomuseum trip: Arrived at venue", m: "Ella's group arrived safely · 9:15am", tag: "trip", read: false },
    { id: "m3", t: "Route B delayed +8 min", m: "2:41pm · also sent by SMS + push", tag: "transport", read: false },
    { id: "m4", t: "Ella earned +2 Teamwork", m: "1:10pm · “great teamwork”", tag: "reward", read: false },
    { id: "m5", t: "New policy needs acknowledgement", m: "Online Safety Policy v2.1", tag: "policy", read: true },
  ],
  teacher: [
    { id: "tm1", t: "3 new trip consents received", m: "Ecomuseum · 24/28 in", tag: "info", read: false },
    { id: "tm2", t: "Staff briefing moved to 3:45pm", m: "Room 12", tag: "event", read: false },
  ],
};
export const INBOX_TONE: Record<string, "ok" | "warn" | "danger" | "info" | "mut"> = {
  event: "info", trip: "info", transport: "warn", reward: "info", info: "mut", policy: "warn",
};

export const AI: Record<string, [string, string][]> = {
  parent: [
    ["What does Ella have this week?", "Mon–Fri normal timetable; swimming Tue (kit), choir Wed 3:30, Ecomuseum trip Fri (consent ✓). Menu nut-free Friday. Bus Route B."],
    ["How has Ella behaved over the last few years?", "Positive trend: net +48 merits this term vs +31 last term, +22 the year before. Mostly teamwork & effort in science; one late-homework note Oct 2025."],
    ["Show her attendance over 3 years", "98.1% (2026), 97.4% (2025), 96.9% (2024) — consistently above the ~95.5% school average, no persistent-absence flags."],
    ["Is Ella on the bus?", "Yes — checked in on Route B at 15:06 by the driver. ETA to Elm Street 15:42 (3 stops away). I'll notify you at your stop."],
    ["What's on the menu today?", "Week 2 Thu: chicken pie or veggie pasta bake; new potatoes & greens; fruit or yoghurt. Allergen: contains gluten."],
  ],
  teacher: [
    ["Summarise 4B attendance this week", "4B is at 96.4% this week: 27/28 present today (Max Turner absent — dentist, parent-reported). No unexplained absences."],
    ["Draft a merit note for Ella", "“Ella showed excellent teamwork in science, guiding her group through the experiment with care and clear explanations.”"],
  ],
  admin: [
    ["How many consents are outstanding?", "4 consents are outstanding for the Ecomuseum trip (departs Friday). Tap Operations → Ecomuseum to chase the 4 families."],
    ["Why did the MIS sync skip records?", "2 SIMS records were skipped: invalid date-of-birth format. They're in the Integration Hub error queue with a suggested mapping fix."],
  ],
};

export type Pupil = { n: string; stop: string; in: boolean };
export type DriverRoute = { name: string; veh: string; started: boolean; mode: "pickup" | "dropoff"; pupils: Pupil[] };
export const DRIVER_ROUTES: DriverRoute[] = [
  { name: "Route B — AM", veh: "NB07 SCH", started: false, mode: "pickup", pupils: [
    { n: "Ella Blake", stop: "Oak Road", in: false }, { n: "Max Blake", stop: "Oak Road", in: false }, { n: "Ollie Reed", stop: "Elm Street", in: false } ] },
  { name: "Route B — PM", veh: "NB07 SCH", started: true, mode: "pickup", pupils: [
    { n: "Ella Blake", stop: "Oak Road", in: false }, { n: "Max Blake", stop: "Oak Road", in: false }, { n: "Amara Osei", stop: "Elm Street", in: false }, { n: "Leo Park", stop: "Birch Lane", in: false } ] },
  { name: "Route C — PM", veh: "NB09 SCH", started: false, mode: "pickup", pupils: [
    { n: "Noah Ali", stop: "High St", in: false }, { n: "Zara Khan", stop: "Mill Lane", in: false } ] },
];

export const TRIP_UPDATE_TEXT: Record<string, string> = {
  start: "Journey started — coach departed school",
  arrived: "Arrived safely at destination",
  traffic: "Heavy traffic on the M40 — running slightly behind",
  delay: "Delay ~20 min; new ETA back at school 15:20",
  eta: "On our way back — ETA school 15:00",
  done: "Returned to school — all pupils safe",
};

export const S_TT: string[][] = [
  ["Reg", "Registration", "Registration", "Registration", "Registration", "Registration"],
  ["P1", "English", "Maths", "English", "Maths", "PE"],
  ["P2", "Maths", "English", "Science", "Topic", "Science"],
  ["Break", "—", "—", "—", "—", "—"],
  ["P3", "Science", "PE", "Maths", "English", "Maths"],
  ["P4", "Topic", "Art", "PSHE", "Music", "Golden"],
  ["Lunch", "—", "—", "—", "—", "—"],
  ["P5", "Reading", "Guided", "Computing", "RE", "Assembly"],
];
export const S_HW: string[][] = [
  ["English", "Spelling list — 15 words", "Due Thu", "set"],
  ["Maths", "Fractions worksheet", "Due Fri", "set"],
  ["Topic", "Roman poster (group)", "Due Mon", "in progress"],
];

export const POLICIES: [string, string][] = [
  ["Terms of Business", "By using SIPlat you agree to use it lawfully, keep your login secure, and handle any information you can see responsibly. Your school is the data controller."],
  ["Terms & Conditions", "The general terms under which SIPlat is provided."],
  ["Privacy Policy", "How we collect, use and protect personal data."],
  ["Data Protection Policy", "UK GDPR. Encrypted, tenant-isolated, role-based. Sensitive data is restricted and masked."],
  ["Cookie Policy", "Cookies and similar technologies we use."],
  ["Acceptable Use Policy", "Don't access data you're not authorised to see or share credentials."],
  ["Safeguarding Policy", "Child location is approximate and only during a journey; report concerns to the DSL."],
  ["Child Protection Policy", "How child protection concerns are handled."],
  ["Data Retention Policy", "How long data is kept and when it is deleted."],
  ["AI Usage Policy", "How Premium AI works, its data scope, limits and human oversight."],
  ["Accessibility Statement", "Our commitment to WCAG and accessible design."],
  ["Service Level Agreement", "Uptime, support response times and remedies (where applicable)."],
];
export const TROUBLE: [string, string][] = [
  ["Login problems", "Check email spelling, Caps Lock off, use ‘Forgot password’."],
  ["Notification issues", "Check Notifications settings and device permissions."],
  ["Bus tracking issues", "Tracking starts when the driver starts the journey."],
  ["AI Assistant issues", "Ensure your AI subscription is active; it only covers your children."],
  ["Calendar issues", "Use filters; events appear once the school publishes them."],
  ["Payment issues", "Check card details and retry; contact support if it fails."],
];

export const ACCOUNTS: Record<RoleKey, { name: string; email: string; role: string }> = {
  parent: { name: "Sarah Blake", email: "sarah@northwind.test", role: "Parent · 2 children" },
  teacher: { name: "Tom Reed", email: "tom@northwind.test", role: "Teacher · 4B" },
  driver: { name: "Dan Cole", email: "dan@northwind.test", role: "Driver · Minibus NB-07" },
  admin: { name: "Alice Turner", email: "alice@northwind.test", role: "School Administrator" },
  student: { name: "Ella Blake", email: "ella@students.test", role: "Student" },
};
