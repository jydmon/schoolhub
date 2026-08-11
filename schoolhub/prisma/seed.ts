import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { getConnector } from "../src/lib/connectors";

const prisma = new PrismaClient();
const hash = (pw: string) => bcrypt.hashSync(pw, 12);
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const ROLES = {
  SCHOOL_ADMIN: "SchoolAdministrator",
  SCHOOL_LEADER: "SchoolLeader",
  TEACHER: "Teacher",
  TRANSPORT_MANAGER: "TransportManager",
  DRIVER: "Driver",
  PARENT: "Parent",
  SUPPORT_STAFF: "SupportStaff",
};

const PLANS = [
  { key: "trial", name: "Trial", pricePerSchool: 0, pricePerStudent: 0, pricePerVehicle: 0, aiQueryLimit: 100, features: "dashboard,calendar" },
  { key: "basic", name: "Basic", pricePerSchool: 4900, pricePerStudent: 0, pricePerVehicle: 0, aiQueryLimit: 500, features: "dashboard,calendar,comms" },
  { key: "standard", name: "Standard", pricePerSchool: 9900, pricePerStudent: 50, pricePerVehicle: 500, aiQueryLimit: 2000, features: "dashboard,calendar,comms,transport,trips" },
  { key: "premium", name: "Premium", pricePerSchool: 19900, pricePerStudent: 100, pricePerVehicle: 900, aiQueryLimit: -1, features: "dashboard,calendar,comms,transport,trips,ai" },
];

async function main() {
  console.log("Seeding SchoolHub (Phase 1 + 2)…");

  const plans: Record<string, string> = {};
  for (const p of PLANS) {
    const plan = await prisma.plan.upsert({ where: { key: p.key }, update: p, create: p });
    plans[p.key] = plan.id;
  }

  await prisma.user.upsert({
    where: { email: "admin@schoolhub.dev" },
    update: {},
    create: {
      email: "admin@schoolhub.dev",
      fullName: "Platform Admin",
      passwordHash: hash("ChangeMe!123"),
      isPlatformAdmin: true,
      emailVerified: true,
      status: "active",
    },
  });

  const trust = await prisma.schoolGroup.upsert({
    where: { id: "seed-trust-northwind" },
    update: {},
    create: { id: "seed-trust-northwind", name: "Northwind Academy Trust" },
  });

  await seedSchool({
    slug: "northwind-primary",
    name: "Northwind Primary School",
    groupId: trust.id,
    planId: plans["standard"],
    className: "4B",
    yearGroup: "Year 4",
    admin: { name: "Alice Turner", email: "alice@northwind.test", ref: "STF-1001", title: "Headteacher", dept: "Leadership" },
    staff: [
      { name: "Tom Reed", email: "tom@northwind.test", role: ROLES.TEACHER, ref: "STF-1002", title: "Class Teacher", dept: "Lower School" },
      { name: "Priya Shah", email: "priya@northwind.test", role: ROLES.TRANSPORT_MANAGER, ref: "STF-1003", title: "Transport Lead", dept: "Operations" },
      { name: "Dan Cole", email: "dan@northwind.test", role: ROLES.DRIVER, ref: "STF-1004", title: "Minibus Driver", dept: "Operations" },
    ],
    parent: { name: "Sarah Blake", email: "sarah@parents.test", phone: "07700 900001", lang: "en" },
    students: [
      { ref: "STU-1001", first: "Ella", last: "Blake", preferred: "Ellie", dob: "2016-04-12", house: "Oak", medical: true, send: false, transport: true },
      { ref: "STU-1002", first: "Max", last: "Blake", dob: "2018-09-03", house: "Oak", medical: false, send: true, transport: true },
    ],
  });

  await seedSchool({
    slug: "riverside-high",
    name: "Riverside High School",
    groupId: null,
    planId: plans["premium"],
    className: "8A",
    yearGroup: "Year 8",
    admin: { name: "Bob Ellis", email: "bob@riverside.test", ref: "STF-2001", title: "Headteacher", dept: "Leadership" },
    staff: [{ name: "Grace Lee", email: "grace@riverside.test", role: ROLES.SCHOOL_LEADER, ref: "STF-2002", title: "Deputy Head", dept: "Leadership" }],
    parent: { name: "Mark Fisher", email: "mark@parents.test", phone: "07700 900050", lang: "pl" },
    students: [{ ref: "STU-2001", first: "Leo", last: "Fisher", dob: "2013-01-22", house: "Kestrel", medical: false, send: false, transport: false }],
  });

  await seedIntegrations("northwind-primary");
  await seedCalendar("northwind-primary");
  await seedKnowledge("northwind-primary");
  await seedTransport("northwind-primary");
  await seedTrips("northwind-primary");
  await seedResidentialRewardsComms("northwind-primary");
  await seedReports("northwind-primary");

  console.log("Seed complete.\n");
  console.log("Sign in:");
  console.log("  Platform admin : admin@schoolhub.dev / ChangeMe!123");
  console.log("  School admin   : alice@northwind.test / Password123!");
  console.log("  School leader  : grace@riverside.test / Password123!");
  console.log("  Parent         : sarah@parents.test / Password123!");
}

type StaffSeed = { name: string; email: string; role: string; ref: string; title: string; dept: string };
type StudentSeed = { ref: string; first: string; last: string; preferred?: string; dob: string; house: string; medical: boolean; send: boolean; transport: boolean };

async function seedSchool(opts: {
  slug: string; name: string; groupId: string | null; planId: string; className: string; yearGroup: string;
  admin: StaffSeed & { title: string; dept: string };
  staff: StaffSeed[];
  parent: { name: string; email: string; phone: string; lang: string };
  students: StudentSeed[];
}) {
  if (await prisma.school.findUnique({ where: { slug: opts.slug } })) {
    console.log(`  · ${opts.name} already present, skipping`);
    return;
  }

  const school = await prisma.school.create({
    data: {
      name: opts.name, slug: opts.slug, status: "active", groupId: opts.groupId, city: "Manchester", country: "United Kingdom",
      config: { create: { academicYear: "2025/2026", timezone: "Europe/London", enabledModules: "dashboard,calendar,transport,trips,comms,ai" } },
      subscription: { create: { planId: opts.planId, status: "active", renewalDate: d("2026-09-01"), aiUsageLimit: 2000 } },
    },
  });

  const cls = await prisma.schoolClass.create({
    data: { schoolId: school.id, name: opts.className, yearGroup: opts.yearGroup },
  });

  // Admin (also a staff profile)
  const admin = await prisma.user.create({
    data: { email: opts.admin.email, fullName: opts.admin.name, passwordHash: hash("Password123!"), emailVerified: true, status: "active", city: "Manchester" },
  });
  await prisma.membership.create({ data: { userId: admin.id, schoolId: school.id, role: ROLES.SCHOOL_ADMIN } });
  await prisma.staffProfile.create({
    data: { schoolId: school.id, userId: admin.id, reference: opts.admin.ref, jobTitle: opts.admin.title, department: opts.admin.dept },
  });

  // Other staff
  for (const s of opts.staff) {
    const u = await prisma.user.create({
      data: { email: s.email, fullName: s.name, passwordHash: hash("Password123!"), emailVerified: true, status: "active" },
    });
    await prisma.membership.create({ data: { userId: u.id, schoolId: school.id, role: s.role } });
    const profile = await prisma.staffProfile.create({
      data: { schoolId: school.id, userId: u.id, reference: s.ref, jobTitle: s.title, department: s.dept },
    });
    if (s.role === ROLES.TEACHER) {
      await prisma.staffClass.create({ data: { staffProfileId: profile.id, classId: cls.id } });
    }
  }

  // Students
  const created: { id: string; ref: string }[] = [];
  for (const st of opts.students) {
    const student = await prisma.student.create({
      data: {
        schoolId: school.id, reference: st.ref, firstName: st.first, lastName: st.last, preferredName: st.preferred || null,
        dateOfBirth: d(st.dob), yearGroup: opts.yearGroup, classId: cls.id, house: st.house, status: "enrolled",
        admissionDate: d("2020-09-01"), medicalAlert: st.medical, sendIndicator: st.send, transportEligible: st.transport,
      },
    });
    created.push({ id: student.id, ref: st.ref });
  }

  // Parent linked to ALL students (one parent → multiple children)
  const parent = await prisma.user.create({
    data: {
      email: opts.parent.email, fullName: opts.parent.name, passwordHash: hash("Password123!"), emailVerified: true,
      status: "active", phone: opts.parent.phone, preferredLanguage: opts.parent.lang, city: "Manchester",
    },
  });
  await prisma.membership.create({ data: { userId: parent.id, schoolId: school.id, role: ROLES.PARENT } });
  for (const c of created) {
    await prisma.guardianLink.create({
      data: {
        schoolId: school.id, parentUserId: parent.id, studentId: c.id, relationship: "Mother",
        isPrimaryContact: true, isEmergencyContact: true, collectionAuthorised: true, hasParentalResponsibility: true,
        custodyArrangement: "Shared",
        notificationPrefs: JSON.stringify({ email: true, sms: true, push: true }),
        infoRestrictions: JSON.stringify([]),
      },
    });
  }

  // Emergency contact + approved collector on the first student
  const first = created[0];
  await prisma.emergencyContact.create({
    data: { schoolId: school.id, studentId: first.id, name: "Grandma Rose", relationship: "Grandparent", phone: "07700 900123", priority: 1 },
  });
  await prisma.approvedCollector.create({
    data: { schoolId: school.id, studentId: first.id, name: "Grandma Rose", relationship: "Grandparent", phone: "07700 900123" },
  });

  // A sample import history entry
  await prisma.importBatch.create({
    data: {
      schoolId: school.id, type: "students", filename: "initial-roll.csv", status: "completed",
      totalRows: opts.students.length, createdRows: opts.students.length, createdById: admin.id, errorReport: "[]",
    },
  });

  await prisma.auditLog.create({
    data: { action: "TENANT_CREATED", schoolId: school.id, actorEmail: "admin@schoolhub.dev", targetType: "School", targetId: school.id, metadata: JSON.stringify({ seeded: true }) },
  });

  console.log(`  · created ${opts.name} (${created.length} students, ${opts.staff.length + 1} staff)`);
}

async function createIntegration(schoolId: string, key: string, over: any = {}) {
  const c = getConnector(key)!;
  const integ = await prisma.integration.create({
    data: {
      schoolId, connectorKey: c.key, name: c.name, category: c.category,
      method: over.method ?? c.methods[0], status: over.status ?? "pending",
      writeBackEnabled: over.writeBackEnabled ?? false,
      config: JSON.stringify(over.config ?? {}),
      webhookToken: over.webhookToken ?? null,
      lastSyncAt: over.lastSyncAt ?? null, lastSuccessAt: over.lastSuccessAt ?? null, lastError: over.lastError ?? null,
      mappings: { create: c.defaultMappings.map((m) => ({ schoolId, domain: m.domain, externalField: m.externalField, internalField: m.internalField, direction: m.direction ?? "in" })) },
    },
  });
  for (const domain of c.domains) {
    await prisma.sourceOfTruth.upsert({
      where: { schoolId_domain: { schoolId, domain } },
      update: { sourceLabel: c.sourceLabel, integrationId: integ.id, writeBack: over.writeBackEnabled ?? false },
      create: { schoolId, domain, sourceLabel: c.sourceLabel, integrationId: integ.id, writeBack: over.writeBackEnabled ?? false },
    });
  }
  return integ;
}

async function seedIntegrations(slug: string) {
  const school = await prisma.school.findUnique({ where: { slug } });
  if (!school) return;
  const studentCount = await prisma.student.count({ where: { schoolId: school.id } });
  const now = new Date();

  // Arbor MIS — connected, scheduled, source of truth for identity + attendance.
  const arbor = await createIntegration(school.id, "arbor", {
    method: "scheduled", status: "connected", config: { baseUrl: "https://api.arbor.sc/v2", scheduleCron: "0 2 * * *" },
    lastSyncAt: now, lastSuccessAt: now,
  });
  await prisma.syncRun.create({
    data: { integrationId: arbor.id, schoolId: school.id, trigger: "scheduled", status: "success", finishedAt: now,
      recordsIn: studentCount, recordsUpdated: Math.floor(studentCount / 2),
      message: "Nightly identity sync", log: JSON.stringify([`${now.toISOString()}  GET https://api.arbor.sc/v2 (scheduled)`, `${now.toISOString()}  Pulled ${studentCount} record(s)`]) },
  });

  // Behaviour & rewards — webhook, source of truth for rewards.
  await createIntegration(school.id, "behaviour-system", {
    method: "webhook", status: "connected", webhookToken: randomBytes(18).toString("hex"), lastSyncAt: now, lastSuccessAt: now,
  });

  // GPS provider — in an error state to demonstrate retry.
  const gps = await createIntegration(school.id, "gps-provider", {
    method: "rest", status: "error", config: { simulateError: true }, lastSyncAt: now, lastError: "Upstream returned 500 (config.simulateError is set)",
  });
  await prisma.syncRun.create({
    data: { integrationId: gps.id, schoolId: school.id, trigger: "manual", status: "failed", finishedAt: now,
      message: "Upstream returned 500 (config.simulateError is set)", log: JSON.stringify([`${now.toISOString()}  Sync started (trigger=manual, method=rest)`, `${now.toISOString()}  ERROR: Upstream returned 500`]) },
  });

  // Journey status stays SchoolHub-native.
  await prisma.sourceOfTruth.upsert({
    where: { schoolId_domain: { schoolId: school.id, domain: "journey" } },
    update: {}, create: { schoolId: school.id, domain: "journey", sourceLabel: "SchoolHub", integrationId: null },
  });

  console.log(`  · integrations seeded for ${school.name} (Arbor, Behaviour, GPS[error])`);
}

async function seedCalendar(slug: string) {
  const school = await prisma.school.findUnique({ where: { slug } });
  if (!school) return;
  const ella = await prisma.student.findUnique({ where: { schoolId_reference: { schoolId: school.id, reference: "STU-1001" } } });
  const now = new Date();
  const at = (offsetDays: number, h: number, m: number) => {
    const d = new Date(now); d.setDate(d.getDate() + offsetDays); d.setHours(h, m, 0, 0); return d;
  };
  const ev = (data: any, studentIds: string[] = []) =>
    prisma.calendarEvent.create({ data: { schoolId: school.id, ...data, students: studentIds.length ? { create: studentIds.map((studentId) => ({ studentId })) } : undefined } });

  await ev({ title: "Whole-school assembly", category: "assembly", startsAt: at(0, 8, 50), endsAt: at(0, 9, 20), audienceScope: "school", location: "Main hall" });
  await ev({ title: "Chess club", category: "club", club: "Chess", startsAt: at(1, 15, 30), endsAt: at(1, 16, 30), audienceScope: "club", location: "Room 4" }, ella ? [ella.id] : []);
  await ev({ title: "Year 4 Sports Day", category: "sports_day", startsAt: at(2, 9, 30), endsAt: at(2, 15, 0), audienceScope: "year", yearGroup: "Year 4", location: "Playing fields", equipment: "PE kit, water bottle", clothing: "House colours", packedLunch: true, reminderOffsets: JSON.stringify([1440]) });
  await ev({
    title: "Year 4 trip: Chester Zoo", category: "trip", startsAt: at(5, 9, 0), endsAt: at(5, 16, 0), audienceScope: "students",
    location: "Chester Zoo", equipment: "Packed lunch, waterproof coat", clothing: "School jumper", packedLunch: true,
    transportRequired: true, collectionAt: at(5, 16, 15), collectionLocation: "Main gate", consentRequired: true, paymentRef: "TRIP-ZOO-01",
    reminderOffsets: JSON.stringify([1440, 60]),
  }, ella ? [ella.id] : []);
  await ev({ title: "Year 4 Parents' Evening", category: "parents_evening", startsAt: at(9, 16, 0), endsAt: at(9, 19, 0), audienceScope: "year", yearGroup: "Year 4", location: "Classrooms", consentRequired: false });
  await ev({ title: "INSET day (school closed to pupils)", category: "inset", startsAt: at(14, 0, 0), allDay: true, audienceScope: "school" });

  await prisma.homework.create({ data: { schoolId: school.id, title: "Maths worksheet 3", subject: "Maths", yearGroup: "Year 4", dueAt: at(3, 16, 0) } });
  await prisma.homework.create({ data: { schoolId: school.id, title: "Reading journal", subject: "English", yearGroup: "Year 4", dueAt: at(6, 9, 0) } });

  console.log(`  · calendar seeded for ${school.name} (6 events, 2 homework, 1 consent-required trip)`);
}

async function seedKnowledge(slug: string) {
  const school = await prisma.school.findUnique({ where: { slug } });
  if (!school) return;
  const now = new Date();
  const eff = new Date(now.getTime() - 30 * 864e5);
  const reviewSoon = new Date(now.getTime() + 10 * 864e5);
  const reviewFar = new Date(now.getTime() + 300 * 864e5);
  const doc = (data: any) => prisma.document.create({ data: { schoolId: school.id, effectiveDate: eff, reviewDate: reviewFar, status: "published", audienceRoles: "parent,staff", ...data } });

  await doc({ title: "Uniform Policy", category: "uniform", bodyText: "The school uniform is a navy jumper with the school logo, a white shirt, grey trousers or skirt, and black shoes. PE kit is a white t-shirt, navy shorts and trainers. On Sports Day, children wear their house colours. Uniform can be ordered from the school office." });
  await doc({ title: "How do I report an absence?", category: "faq", bodyText: "To report your child's absence, call the school office on 0161 555 0100 before 9:00am on each day of absence, or email attendance@northwind.test. Please give your child's name, class and the reason for absence." });
  await doc({ title: "Behaviour Policy", category: "behaviour", bodyText: "Our behaviour policy is built on three rules: Ready, Respectful, Safe. Positive behaviour earns house points; persistent issues follow a staged response involving parents." });
  await doc({ title: "Safeguarding Information for Parents", category: "safeguarding", bodyText: "The safety of our pupils is our highest priority. The Designated Safeguarding Lead is Mrs Alice Turner. Any concern about a child's welfare should be reported to the school office immediately." });
  await doc({ title: "Parent Handbook 2025/26", category: "parent_handbook", bodyText: "Welcome to Northwind Primary. The school day starts at 08:45 and ends at 15:15. Doors open at 08:35. Lunches are freshly prepared on site; menus rotate on a three-week cycle. Please label all belongings." });
  await doc({ title: "Northwind Weekly — Newsletter", category: "newsletter", sourceType: "newsletter", bodyText: "Northwind Weekly. This week we enjoyed a wonderful whole-school assembly. Reminder: Year 4 Sports Day is coming up — please send children in their PE kit and house colours with a water bottle. Consent for the Year 4 Chester Zoo trip is now open; please respond via the app. Chess club continues on Tuesdays." });
  await doc({ title: "Educational Visits Procedure", category: "policy", audienceRoles: "staff", reviewDate: reviewSoon, bodyText: "All educational visits must be approved by the Educational Visits Coordinator (EVC) before booking. A risk assessment is required for every visit. Ratios: 1:6 for Year 4. Emergency contacts and medical information must be carried by the trip lead." });
  await doc({ title: "Lunch Menu (Autumn)", category: "menu", bodyText: "Week 1: Monday roast chicken; Tuesday pasta bolognese; Wednesday fish and chips; Thursday curry; Friday pizza. Vegetarian and allergen-free options available daily." });
  await prisma.document.create({ data: { schoolId: school.id, title: "Draft: Mobile Phone Policy", category: "policy", status: "draft", audienceRoles: "staff", bodyText: "DRAFT — pupils must hand phones to the class teacher at the start of the day." } });

  await prisma.sharedMailbox.create({ data: { schoolId: school.id, address: "office@northwind.test", label: "Main office" } });

  console.log(`  · knowledge hub seeded for ${school.name} (8 documents inc. 1 draft + 1 due-for-review, 1 mailbox)`);
}

async function seedTransport(slug: string) {
  const school = await prisma.school.findUnique({ where: { slug } });
  if (!school) return;
  const driver = await prisma.user.findUnique({ where: { email: "dan@northwind.test" } });
  const ella = await prisma.student.findUnique({ where: { schoolId_reference: { schoolId: school.id, reference: "STU-1001" } } });
  const max = await prisma.student.findUnique({ where: { schoolId_reference: { schoolId: school.id, reference: "STU-1002" } } });
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const vehicle = await prisma.vehicle.create({ data: { schoolId: school.id, reference: "NW-BUS-1", label: "Minibus 1", capacity: 16, type: "minibus", gpsSource: "driver_phone" } });
  const route = await prisma.route.create({
    data: {
      schoolId: school.id, name: "Green Lane Run", type: "fixed", vehicleId: vehicle.id, driverUserId: driver?.id ?? null, cutoffTime: "07:15",
      stops: { create: [
        { name: "Green Lane", kind: "pickup", plannedArrival: "07:30", sequence: 0, lat: 53.4808, lng: -2.2426 },
        { name: "Mill Road", kind: "shared", plannedArrival: "07:40", sequence: 1, lat: 53.4790, lng: -2.2500 },
        { name: "Northwind Primary", kind: "school", plannedArrival: "08:30", sequence: 2, lat: 53.4700, lng: -2.2300 },
      ] },
    },
    include: { stops: true },
  });
  const greenLane = route.stops.find((s) => s.name === "Green Lane");

  for (const st of [ella, max].filter(Boolean) as any[]) {
    await prisma.studentTransportProfile.create({
      data: { studentId: st.id, schoolId: school.id, routeId: route.id, vehicleId: vehicle.id, morningStopId: greenLane?.id, afternoonStopId: greenLane?.id, homeAddress: "12 Green Lane, Manchester", transportDays: "Mon,Tue,Wed,Thu,Fri", emergencyContact: "Sarah Blake 07700 900001" },
    });
  }

  const journey = await prisma.journey.create({ data: { schoolId: school.id, routeId: route.id, date: dateStr, session: "am", driverUserId: driver?.id ?? null, vehicleId: vehicle.id, status: "started", startedAt: new Date(), delayMinutes: 5 } });
  if (ella) await prisma.boardingRecord.create({ data: { journeyId: journey.id, studentId: ella.id, status: "boarded" } });
  await prisma.vehiclePosition.create({ data: { vehicleId: vehicle.id, journeyId: journey.id, lat: 53.4795, lng: -2.2470 } });
  await prisma.incident.create({ data: { schoolId: school.id, journeyId: journey.id, reportedByUserId: driver?.id ?? null, type: "delay", notes: "Roadworks on Mill Road, ~5 min delay" } });

  const parent = await prisma.user.findUnique({ where: { email: "sarah@parents.test" } });
  if (parent) {
    await prisma.notification.createMany({ data: [
      { userId: parent.id, schoolId: school.id, studentId: ella?.id ?? null, journeyId: journey.id, kind: "route_started", title: "Bus has started the morning route" },
      { userId: parent.id, schoolId: school.id, studentId: ella?.id ?? null, journeyId: journey.id, kind: "boarded", title: "Ella has boarded the bus" },
    ] });
  }
  console.log(`  · transport seeded for ${school.name} (1 vehicle, 1 route, 2 profiles, 1 live journey)`);
}

async function seedTrips(slug: string) {
  const school = await prisma.school.findUnique({ where: { slug } });
  if (!school) return;
  const tom = await prisma.user.findUnique({ where: { email: "tom@northwind.test" } });
  const ella = await prisma.student.findUnique({ where: { schoolId_reference: { schoolId: school.id, reference: "STU-1001" } } });
  const d = new Date(); d.setDate(d.getDate() + 7);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const trip = await prisma.trip.create({
    data: {
      schoolId: school.id, title: "Science Museum Visit", purpose: "STEM enrichment", date: dateStr, destination: "Science and Industry Museum",
      departurePoint: "Main gate", departureTime: "09:00", returnTime: "15:30", leadTeacherUserId: tom?.id ?? null,
      transportProvider: "City Coaches", coachDetails: "49-seat coach", venue: "MSI Manchester", itinerary: "09:00 depart, 10:00 arrive, workshops, 12:30 lunch, 14:30 depart",
      packingList: "Packed lunch, waterproof coat", medicalRequirements: "Bring inhalers", consentRequired: true, paymentStatus: "free", riskAssessmentRef: "RA-SCI-07", status: "planned",
    },
  });
  if (ella) await prisma.tripStudent.create({ data: { tripId: trip.id, studentId: ella.id, consent: "pending" } });
  if (tom) await prisma.tripStaff.create({ data: { tripId: trip.id, userId: tom.id, role: "lead" } });
  console.log(`  · trips seeded for ${school.name} (1 upcoming trip, consent pending)`);
}

async function seedResidentialRewardsComms(slug: string) {
  const school = await prisma.school.findUnique({ where: { slug } });
  if (!school) return;
  const ella = await prisma.student.findUnique({ where: { schoolId_reference: { schoolId: school.id, reference: "STU-1001" } } });
  const max = await prisma.student.findUnique({ where: { schoolId_reference: { schoolId: school.id, reference: "STU-1002" } } });
  const tom = await prisma.user.findUnique({ where: { email: "tom@northwind.test" } });
  const sarah = await prisma.user.findUnique({ where: { email: "sarah@parents.test" } });
  const ago = (days: number) => new Date(Date.now() - days * 864e5);
  const plus = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

  // --- Phase 10: residential trip ---
  const res = await prisma.trip.create({
    data: {
      schoolId: school.id, title: "Lake District Residential", purpose: "Outdoor education", date: plus(14), endDate: plus(16),
      destination: "Ambleside", accommodation: "YHA Ambleside", returnPlan: "Coach returns to school ~17:00 on the final day",
      departurePoint: "Main gate", departureTime: "08:00", leadTeacherUserId: tom?.id ?? null, transportProvider: "City Coaches",
      isResidential: true, consentRequired: true, riskAssessmentRef: "RA-RES-11", packingList: "Waterproofs, walking boots, sleeping bag, toiletries",
      medicalRequirements: "Bring all regular medication", medicationReferences: "See student medical profiles", status: "planned",
    },
  });
  if (ella) await prisma.tripStudent.create({ data: { tripId: res.id, studentId: ella.id, consent: "given" } });
  if (tom) await prisma.tripStaff.create({ data: { tripId: res.id, userId: tom.id, role: "lead" } });
  await prisma.tripDay.createMany({ data: [
    { tripId: res.id, date: plus(14), title: "Arrival & orientation", itinerary: "Arrive, settle in, evening walk", sequence: 0 },
    { tripId: res.id, date: plus(15), title: "Fell walking", itinerary: "Guided hike, packed lunch, evening quiz", sequence: 1 },
    { tripId: res.id, date: plus(16), title: "Kayaking & return", itinerary: "Morning kayaking, lunch, coach home", sequence: 2 },
  ] });
  await prisma.tripHeadcount.create({ data: { tripId: res.id, byUserId: tom?.id ?? null, kind: "welfare", expected: 1, present: 1, note: "All well, good spirits" } });
  await prisma.tripPhoto.create({ data: { tripId: res.id, url: "https://example.com/photos/fell-walk.jpg", caption: "Fell walking group", sharedWithParents: true } });

  // --- Phase 11: reward & behaviour records ---
  if (ella) {
    await prisma.rewardRecord.createMany({ data: [
      { schoolId: school.id, studentId: ella.id, type: "merit", points: 2, category: "Effort", teacherName: "Mr Reed", note: "Excellent maths work", at: ago(2) },
      { schoolId: school.id, studentId: ella.id, type: "house_point", points: 1, teacherName: "Mrs Turner", at: ago(5) },
      { schoolId: school.id, studentId: ella.id, type: "badge", points: 5, category: "Reading", note: "Bronze reading badge", at: ago(9) },
      { schoolId: school.id, studentId: ella.id, type: "praise", points: 1, teacherName: "Mr Reed", note: "Helpful to classmates", at: ago(12) },
      { schoolId: school.id, studentId: ella.id, type: "detention", points: 0, positive: false, teacherName: "Mr Reed", note: "Late to lesson twice", at: ago(6) },
    ] });
  }
  if (max) await prisma.rewardRecord.createMany({ data: [
    { schoolId: school.id, studentId: max.id, type: "merit", points: 1, teacherName: "Mr Reed", at: ago(3) },
    { schoolId: school.id, studentId: max.id, type: "attendance_award", points: 3, note: "100% attendance", at: ago(8) },
  ] });

  // Private home reward rules (Sarah)
  if (sarah && ella) {
    await prisma.homeRewardRule.createMany({ data: [
      { guardianUserId: sarah.id, studentId: ella.id, threshold: 20, reward: "choose a film" },
      { guardianUserId: sarah.id, studentId: ella.id, threshold: 50, reward: "family activity" },
    ] });
    await prisma.notificationPreference.create({ data: { userId: sarah.id } });
  }

  // --- Phase 12: a broadcast message ---
  const msg = await prisma.message.create({ data: { schoolId: school.id, senderUserId: tom?.id ?? null, title: "Reminder: Year 4 Sports Day kit", body: "Please send children in PE kit and house colours with a water bottle.", channels: "inapp,push", priority: "normal", targeting: JSON.stringify({ type: "year", value: "Year 4", audience: "parents" }), recipientCount: sarah ? 1 : 0 } });
  if (sarah) await prisma.notification.create({ data: { userId: sarah.id, schoolId: school.id, messageId: msg.id, kind: "message", title: msg.title, body: msg.body, channel: "inapp", status: "delivered" } });

  // --- Phase 13: a scheduled report ---
  await prisma.scheduledReport.create({ data: { schoolId: school.id, type: "transport", cadence: "weekly", format: "csv", recipients: "office@northwind.test", scope: "leader", createdById: tom?.id ?? null } });

  console.log(`  · residential trip, ${ella ? "reward records" : ""}, home rules, a broadcast message & a scheduled report seeded for ${school.name}`);
}

// --- Phase 15: pupil reports (released / scheduled / awaiting approval) ---
async function seedReports(slug: string) {
  const school = await prisma.school.findUnique({ where: { slug } });
  if (!school) return;
  if (await prisma.reportRelease.findFirst({ where: { schoolId: school.id } })) return;

  const teacher = await prisma.user.findUnique({ where: { email: "tom@northwind.test" } });
  const head = await prisma.user.findUnique({ where: { email: "alice@northwind.test" } });
  const students = await prisma.student.findMany({ where: { schoolId: school.id }, orderBy: { reference: "asc" }, take: 3 });
  if (students.length === 0) return;

  const now = new Date();
  const daysFromNow = (n: number) => new Date(now.getTime() + n * 86400000);
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
  const body = (grade: string, comment: string) =>
    JSON.stringify({ subjects: [{ name: "English", grade }, { name: "Maths", grade }, { name: "Science", grade }], attendance: "97%", comment });

  const guardianLinks = await prisma.guardianLink.findMany({ where: { studentId: { in: students.map((s) => s.id) } }, select: { parentUserId: true } });
  const parentIds = Array.from(new Set(guardianLinks.map((l) => l.parentUserId)));

  // A — released annual reports (one already viewed by a parent)
  const relA = await prisma.reportRelease.create({
    data: { schoolId: school.id, name: "Summer 2026 — Year 4 annual reports", type: "annual", term: "Summer 2026", status: "released", notifyChannels: "inapp,push,email", createdById: teacher?.id ?? null, approvedById: head?.id ?? null, approvedAt: daysAgo(6), releaseAt: daysAgo(5), releasedAt: daysAgo(5) },
  });
  const gradeCycle = ["Exceeding", "Meeting", "Meeting"];
  for (const [i, st] of students.entries()) {
    await prisma.studentReport.create({
      data: { schoolId: school.id, releaseId: relA.id, studentId: st.id, type: "annual", title: `Annual report — ${st.firstName} ${st.lastName}`, term: "Summer 2026", summary: "A strong year with excellent progress in reading and confident work in maths.", bodyJson: body(gradeCycle[i % 3], `${st.firstName} has had a wonderful year — a caring classmate who tackles new challenges with resilience.`), status: "released", authorId: teacher?.id ?? null, approvedById: head?.id ?? null, approvedAt: daysAgo(6), releaseAt: daysAgo(5), releasedAt: daysAgo(5), firstViewedAt: i === 0 ? daysAgo(4) : null },
    });
  }
  const msgA = await prisma.message.create({
    data: { schoolId: school.id, senderUserId: head?.id ?? null, title: "Annual report card now available", body: "Summer 2026 annual reports have been released. Open Reports to view your child's report.", channels: "inapp,push,email", priority: "normal", targeting: JSON.stringify({ kind: "report_release", releaseId: relA.id }), recipientCount: parentIds.length },
  });
  await prisma.reportRelease.update({ where: { id: relA.id }, data: { messageId: msgA.id } });
  for (const pid of parentIds) {
    for (const ch of ["inapp", "push", "email"]) {
      await prisma.notification.create({ data: { userId: pid, schoolId: school.id, messageId: msgA.id, kind: "message", title: msgA.title, body: msgA.body, channel: ch, status: "delivered", read: ch === "inapp" } });
    }
  }

  // B — scheduled termly reports (embargoed for release in a week)
  const relB = await prisma.reportRelease.create({
    data: { schoolId: school.id, name: "Autumn 2026 — Year 4 progress reports", type: "termly", term: "Autumn 2026", status: "scheduled", notifyChannels: "inapp,push,email,sms", createdById: teacher?.id ?? null, approvedById: head?.id ?? null, approvedAt: now, releaseAt: daysFromNow(7) },
  });
  for (const st of students) {
    await prisma.studentReport.create({
      data: { schoolId: school.id, releaseId: relB.id, studentId: st.id, type: "termly", title: `Progress report — ${st.firstName} ${st.lastName}`, term: "Autumn 2026", summary: "On track across the curriculum.", bodyJson: body("Meeting", "Making expected progress this term with growing independence."), status: "scheduled", authorId: teacher?.id ?? null, approvedById: head?.id ?? null, approvedAt: now, releaseAt: daysFromNow(7) },
    });
  }

  // C — submitted, awaiting school-leadership approval
  const relC = await prisma.reportRelease.create({
    data: { schoolId: school.id, name: "Attendance & behaviour — Autumn half-term", type: "attendance_behaviour", term: "Autumn 2026", status: "submitted", notifyChannels: "inapp,push,email", createdById: teacher?.id ?? null },
  });
  for (const st of students.slice(0, 2)) {
    await prisma.studentReport.create({
      data: { schoolId: school.id, releaseId: relC.id, studentId: st.id, type: "attendance_behaviour", title: `Attendance & behaviour — ${st.firstName} ${st.lastName}`, term: "Autumn 2026", summary: "96% attendance; 12 house points this half-term.", bodyJson: JSON.stringify({ attendance: "96%", housePoints: 12, comment: "A positive attitude to learning." }), status: "submitted", authorId: teacher?.id ?? null },
    });
  }

  console.log(`  · 3 report releases (released / scheduled / awaiting approval) seeded for ${school.name}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
