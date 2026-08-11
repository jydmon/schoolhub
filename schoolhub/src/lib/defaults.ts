import { prisma } from "./db";
import { createPolicy } from "./policies";
import { createTemplate } from "./templates";
import { createVideo } from "./cms";

/* ---------------------------------------------------------------------------
 * Idempotent starter content for a fresh platform: subscription packages,
 * platform-wide policies, help videos and message templates. Safe to run more
 * than once — existing items (matched by key / title / name) are skipped.
 * ------------------------------------------------------------------------- */

const PLANS = [
  { key: "trial", name: "Free Trial", pricePerSchool: 0, pricePerStudent: 0, pricePerVehicle: 0, aiQueryLimit: 50, features: "core,messaging,calendar" },
  { key: "basic", name: "Basic", pricePerSchool: 0, pricePerStudent: 300, pricePerVehicle: 0, aiQueryLimit: 200, features: "core,messaging,calendar,transport" },
  { key: "standard", name: "Standard", pricePerSchool: 0, pricePerStudent: 500, pricePerVehicle: 1500, aiQueryLimit: 1000, features: "core,messaging,calendar,transport,behaviour,reports,integrations" },
  { key: "premium", name: "Premium", pricePerSchool: 0, pricePerStudent: 800, pricePerVehicle: 2500, aiQueryLimit: -1, features: "core,messaging,calendar,transport,behaviour,reports,integrations,ai,crm,cms" },
];

const POLICIES = [
  { title: "Data Protection & Privacy Policy", category: "data_protection", audience: "all", requireAck: true,
    summary: "How SIPlat and your school collect, use, store and protect personal data in line with UK GDPR.",
    body: "SIPlat processes personal data only to deliver school services to pupils, parents and staff. Pupil data is encrypted at rest and masked from platform staff unless a school administrator explicitly grants access. Data is never sold. Parents may request access to, or deletion of, their data through the school. Retention follows statutory education record-keeping requirements." },
  { title: "Safeguarding & Child Protection Policy", category: "safeguarding", audience: "all", requireAck: true,
    summary: "Our commitment to keeping children safe, and how safeguarding information is handled on the platform.",
    body: "Safeguarding is everyone's responsibility. Safeguarding and child-protection records are restricted to Designated Safeguarding Leads and are never visible to general platform staff. Concerns raised through connected systems (e.g. CPOMS, MyConcern) are held under the strictest access controls. Anyone with a concern about a child should contact their school's DSL immediately." },
  { title: "Acceptable Use Policy", category: "general", audience: "all",
    summary: "The rules for using SIPlat responsibly and securely.",
    body: "Accounts are personal and must not be shared. Users must keep passwords confidential and enable multi-factor authentication where offered. The platform must not be used to share unlawful, harmful or discriminatory content. Suspected misuse should be reported to your school administrator." },
  { title: "Behaviour & Rewards Policy", category: "behaviour", audience: "all",
    summary: "How behaviour points, rewards and sanctions are recorded and shared with families.",
    body: "Behaviour and reward information is recorded by school staff and shared with parents to support a consistent home–school approach. Records are factual and proportionate. Parents can discuss any record with the school." },
  { title: "Transport & Trips Safety Policy", category: "transport", audience: "all",
    summary: "Keeping pupils safe on school transport and trips, including live tracking and consent.",
    body: "Live vehicle tracking is used solely to give parents accurate arrival information and to safeguard pupils in transit. Location data is retained only as long as operationally necessary. Consent for trips is collected from parents in advance, and collection arrangements are verified for every journey." },
];

const VIDEOS = [
  { title: "Getting started with SIPlat", category: "getting_started", audience: "all", sequence: 1,
    description: "A 3-minute tour of your dashboard and the things you can do on day one.", url: "https://cdn.siplat.com/help/getting-started.mp4" },
  { title: "For parents: your family dashboard", category: "parents", audience: "parent", sequence: 2,
    description: "See all your children in one place — calendar, reports, transport and messaging.", url: "https://cdn.siplat.com/help/parents-dashboard.mp4" },
  { title: "For staff: running your school", category: "staff", audience: "staff", sequence: 3,
    description: "People, trips, behaviour, comms and reports — the essentials for school staff.", url: "https://cdn.siplat.com/help/staff-overview.mp4" },
  { title: "Tracking transport & trips", category: "transport", audience: "all", sequence: 4,
    description: "How live tracking works and how parents get accurate arrival times.", url: "https://cdn.siplat.com/help/transport-tracking.mp4" },
  { title: "Connecting your MIS & integrations", category: "integrations", audience: "admin", sequence: 5,
    description: "Link your MIS and other systems through the Integration Hub.", url: "https://cdn.siplat.com/help/integrations.mp4" },
];

const TEMPLATES = [
  { kind: "email_campaign", name: "Welcome to SIPlat", category: "onboarding", subject: "Welcome to {{schoolName}} on SIPlat", channels: ["email"], sharedWithTenants: true,
    body: "Hello {{firstName}},\n\nYour school is now on SIPlat — one place for everything happening at school. Log in to see your calendar, messages and more.\n\nWarm regards,\n{{schoolName}}" },
  { kind: "email_campaign", name: "Weekly newsletter", category: "newsletter", subject: "{{schoolName}} — this week", channels: ["email", "inapp"], sharedWithTenants: true,
    body: "Dear families,\n\nHere's what's happening this week at {{schoolName}}:\n\n• \n• \n\nThank you for your continued support." },
  { kind: "email_notification", name: "Absence follow-up", category: "attendance", subject: "We missed {{firstName}} today", channels: ["email", "sms"], sharedWithTenants: true,
    body: "Dear parent/guardian,\n\nOur records show {{firstName}} was absent today. If you haven't already let us know the reason, please reply or contact the school office.\n\nThank you." },
  { kind: "email_campaign", name: "Parents' evening invitation", category: "events", subject: "Book your parents' evening slot", channels: ["email", "inapp"], sharedWithTenants: true,
    body: "Dear parent/guardian,\n\nParents' evening is approaching. Please log in to book your appointment with {{firstName}}'s teachers.\n\nWe look forward to seeing you." },
];

export async function seedDefaultContent(actorUserId?: string | null): Promise<{ plans: number; policies: number; videos: number; templates: number }> {
  let plans = 0, policies = 0, videos = 0, templates = 0;

  for (const p of PLANS) {
    await prisma.plan.upsert({
      where: { key: p.key },
      update: {}, // don't clobber edits the admin may have made
      create: { key: p.key, name: p.name, pricePerSchool: p.pricePerSchool, pricePerStudent: p.pricePerStudent, pricePerVehicle: p.pricePerVehicle, aiQueryLimit: p.aiQueryLimit, features: p.features, isActive: true },
    });
    plans++;
  }

  for (const p of POLICIES) {
    const exists = await prisma.policy.findFirst({ where: { schoolId: null, title: p.title }, select: { id: true } });
    if (exists) continue;
    await createPolicy({ schoolId: null, title: p.title, category: p.category, audience: p.audience, summary: p.summary, body: p.body, requireAck: (p as any).requireAck ?? false, published: true, version: "1.0", actorUserId });
    policies++;
  }

  for (const v of VIDEOS) {
    const exists = await prisma.helpVideo.findFirst({ where: { schoolId: null, title: v.title }, select: { id: true } });
    if (exists) continue;
    await createVideo({ schoolId: null, title: v.title, description: v.description, category: v.category, audience: v.audience, url: v.url, sequence: v.sequence, published: true, actorUserId });
    videos++;
  }

  for (const t of TEMPLATES) {
    const exists = await prisma.messageTemplate.findFirst({ where: { scope: "platform", name: t.name }, select: { id: true } });
    if (exists) continue;
    await createTemplate({ scope: "platform", kind: t.kind, name: t.name, category: t.category, subject: t.subject, body: t.body, channels: t.channels, sharedWithTenants: t.sharedWithTenants, actorUserId });
    templates++;
  }

  return { plans, policies, videos, templates };
}
