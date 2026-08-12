import type { Answer } from "./answer";

// Contextual "how do I…" / "where is…" guidance. When a user asks how to do
// something or where to find a feature, we answer with concise, accurate
// navigation steps instead of searching records. This is permission-agnostic
// help (it points at features; it doesn't reveal data). Matched before record
// retrieval in the ask route.

type Guide = { keys: string[]; answer: string; page?: string };

const GUIDES: Guide[] = [
  { keys: ["add", "new", "create", "student", "pupil", "child", "enrol", "enroll"], answer: "To add a pupil: open **Students** in the left menu, click **Add student**, fill in the details and save. To add many at once, use **Manual import** with the students CSV template.", page: "students" },
  { keys: ["add", "new", "staff", "teacher", "employee"], answer: "To add a staff member: open **Staff**, click **New staff member**, enter their name, email, role and job title, then save. You can bulk-add staff from **Manual import**.", page: "staff" },
  { keys: ["add", "link", "parent", "guardian", "carer"], answer: "Parents/guardians are usually linked from a pupil: open **Students** → click the pupil → **Parents & guardians** → add. You can also bulk-add via **Manual import**, then link them to pupils.", page: "guardians" },
  { keys: ["invite", "parent", "guardian", "platform", "access", "onboard"], answer: "To invite a parent: open **Guardians**, use the ⋯ menu on their row (or select several and use the bulk bar) → **Invite to platform**. In the dialog you choose the channels (email, app, SMS, WhatsApp) and can set a temporary password. Note: invitation emails only send once a live email provider is configured (super-admin → Platform comms → Email).", page: "guardians" },
  { keys: ["create", "add", "new", "event", "calendar"], answer: "To add a calendar event: open **Calendar**, click **New event**, set the title, category, date/time, audience and any logistics, then create it. Trips, homework and timetable lessons appear on the calendar automatically.", page: "calendar" },
  { keys: ["trip", "excursion", "visit", "consent"], answer: "Manage trips under **Trips** — create the trip, add pupils and staff, and collect consent. Trips also show automatically on the **Calendar**.", page: "trips" },
  { keys: ["timetable", "lesson", "period", "schedule"], answer: "Open **Timetable** to add weekly lessons (day, time, subject, room), each linked to a class/year and a teacher. Filter by teacher or year to see a specific schedule. Lessons also appear on the **Calendar**.", page: "timetable" },
  { keys: ["attendance", "register", "present", "absent", "mark"], answer: "Record and review attendance under **Attendance** — mark AM/PM sessions per pupil. Attendance metrics are also available as a report in **Reports & search**.", page: "attendance" },
  { keys: ["behaviour", "behavior", "merit", "reward", "incident", "detention", "sanction"], answer: "Record merits, incidents and other behaviour under **Behaviour** → **Add record**. You can choose whether to notify guardians per entry (still subject to their own preferences).", page: "behaviour" },
  { keys: ["message", "email", "sms", "whatsapp", "contact", "communicate", "announce", "newsletter"], answer: "Send messages and announcements to parents/staff under **Comms** — compose, choose the audience and channels, and send.", page: "comms" },
  { keys: ["report", "card", "pupil report", "school report"], answer: "Pupil report cards live under **Pupils reports** — create/import individual reports (open one to view or edit it as a document), and group them into a **release** to approve and send to parents.", page: "reports" },
  { keys: ["report", "pdf", "download", "export", "counts", "metrics", "generate"], answer: "For downloadable reports, open **Reports & search** → **Reports & downloads**: pick a report (pupil roll, attendance, transport, trips, engagement, etc.) and download it as PDF or CSV.", page: "insights" },
  { keys: ["search", "find", "global", "everything", "locate"], answer: "Use **Reports & search** → **Global search** to search across the whole portal at once — pupils, parents, staff, calendar, trips, meals, documents and reports — with a link to jump to each section. The **Ask AI Assistant** box on the Overview also answers questions from your data.", page: "insights" },
  { keys: ["meal", "menu", "lunch", "food", "allergen", "vegetarian", "vegan"], answer: "Manage the canteen menu under **Meals & menus** — click **New menu item** (week, day, class/year, allergens, veg/vegan, price), or import a CSV.", page: "meals" },
  { keys: ["notification", "alert", "preference", "channel", "quiet hours", "digest"], answer: "Your notification inbox and channel/digest/quiet-hours preferences are under **Notifications**.", page: "notifications" },
  { keys: ["history", "audit", "who changed", "activity", "log"], answer: "Open **History** to search everything that's happened across your school — who changed what and when — with filters and CSV export.", page: "audit" },
  { keys: ["role", "permission", "user", "access", "team"], answer: "Manage user accounts and their roles/permissions under **Users & roles**.", page: "users" },
  { keys: ["import", "csv", "bulk", "upload", "spreadsheet"], answer: "Bulk-load data (students, guardians, staff, menus, trips, attendance, calendar…) under **Manual import** using the matching CSV template. Records arrive tagged as imported.", page: "import" },
  { keys: ["integration", "connect", "mis", "sync", "api"], answer: "Connect external systems under **Integrations** (and the **Integration Hub** for the marketplace, imports and source-of-truth mapping). A super-admin can help scaffold a connector; you supply your own credentials.", page: "integrations" },
  { keys: ["config", "branding", "settings", "logo", "head teacher", "term dates"], answer: "School branding, contact details, term dates and modules are under **School configuration**.", page: "config" },
  { keys: ["policy", "policies", "acknowledge", "accept", "terms"], answer: "Mandatory policies appear as a reminder when you log in — you can **View policy** (with a PDF), **Accept**, or close the reminder (it returns each login until accepted). Super-admins publish and track policies under **Policies**.", page: "audit" },
  { keys: ["email", "provider", "smtp", "resend", "not sending", "not received", "delivery"], answer: "Email delivery is set up by a super-admin under **Platform comms → Email**: choose a provider (e.g. Resend or SMTP), paste the key, and run the test. Until a live provider is configured and verified, emails (including invitations) are not actually delivered.", page: "config" },
  { keys: ["ai", "assistant", "groq", "model", "key"], answer: "The AI model is configured by a super-admin under **Platform comms → AI Assistant model** — pick a provider (Groq/Gemini/OpenRouter have free tiers), paste the key and run the test. The assistant still answers from your records without a model; a model adds natural phrasing and translation.", page: "config" },
];

const HOWTO = ["how", "where", "how do", "how to", "how can", "can i", "steps", "set up", "setup", "guide", "help me", "add", "create", "new", "invite", "send", "record", "generate", "find", "manage", "enable"];

export function matchGuidance(question: string): Answer | null {
  const q = (question || "").toLowerCase();
  if (!HOWTO.some((w) => q.includes(w))) return null;
  const words = new Set(q.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));
  let best: Guide | null = null;
  let bestScore = 0;
  for (const g of GUIDES) {
    let score = 0;
    for (const k of g.keys) if (k.includes(" ") ? q.includes(k) : words.has(k)) score += 1;
    if (score > bestScore) { bestScore = score; best = g; }
  }
  if (!best || bestScore < 2) return null;
  return { answer: best.answer, citations: [], found: true, verbatim: true };
}
