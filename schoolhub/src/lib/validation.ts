import { z } from "zod";
import { SCHOOL_ROLES, SUBSCRIPTION_STATUSES } from "./constants";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mfaToken: z.string().optional(),
});

export const onboardSchoolSchema = z.object({
  schoolName: z.string().min(2),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and hyphens only"),
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
  // Any package key defined in the Packages list (validated against the DB in the route).
  planKey: z.string().min(2).max(40),
  groupId: z.string().optional().nullable(),
  timezone: z.string().default("Europe/London"),
});

export const createUserSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  role: z.enum(SCHOOL_ROLES as [string, ...string[]]),
});

export const updateConfigSchema = z.object({
  name: z.string().min(2).optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
  colorPrimary: z.string().optional(),
  colorAccent: z.string().optional(),
  addressLine1: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  timezone: z.string().optional(),
  academicYear: z.string().optional(),
  dataRetentionDays: z.number().int().min(1).max(3650).optional(),
  enabledModules: z.array(z.string()).optional(),
  termDates: z
    .array(z.object({ name: z.string(), start: z.string(), end: z.string() }))
    .optional(),
  notificationSettings: z.record(z.boolean()).optional(),
});

export const updateSubscriptionSchema = z.object({
  planKey: z.string().min(2).max(40).optional(),
  status: z.enum(SUBSCRIPTION_STATUSES as unknown as [string, ...string[]]).optional(),
  renewalDate: z.string().optional(),
  studentLimit: z.number().int().min(0).optional(),
  vehicleLimit: z.number().int().min(0).optional(),
  aiUsageLimit: z.number().int().min(0).optional(),
});

export const setTenantStatusSchema = z.object({
  status: z.enum(["active", "suspended", "trial", "archived"]),
});

export const registerParentSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

export const enableMfaSchema = z.object({
  token: z.string().min(6),
});

// ----------------------------------------------------------------------------
// Phase 2 — students, guardians, staff
// ----------------------------------------------------------------------------

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const studentCreateSchema = z.object({
  reference: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  preferredName: z.string().optional(),
  dateOfBirth: dateStr.optional().or(z.literal("")),
  photoUrl: z.string().url().optional().or(z.literal("")),
  campusId: z.string().optional().nullable(),
  yearGroup: z.string().optional(),
  className: z.string().optional(),
  house: z.string().optional(),
  status: z.enum(["applicant", "enrolled", "leaver", "archived"]).optional(),
  admissionDate: dateStr.optional().or(z.literal("")),
  medicalAlert: z.boolean().optional(),
  sendIndicator: z.boolean().optional(),
  transportEligible: z.boolean().optional(),
});

export const studentUpdateSchema = studentCreateSchema.partial();

export const guardianLinkSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  phone: z.string().optional(),
  preferredLanguage: z.string().optional(),
  relationship: z.string().optional(),
  isPrimaryContact: z.boolean().optional(),
  isEmergencyContact: z.boolean().optional(),
  collectionAuthorised: z.boolean().optional(),
  hasParentalResponsibility: z.boolean().optional(),
  custodyArrangement: z.string().optional(),
  notificationPrefs: z.record(z.boolean()).optional(),
  infoRestrictions: z.array(z.string()).optional(),
});

export const guardianLinkUpdateSchema = z.object({
  relationship: z.string().optional(),
  isPrimaryContact: z.boolean().optional(),
  isEmergencyContact: z.boolean().optional(),
  collectionAuthorised: z.boolean().optional(),
  hasParentalResponsibility: z.boolean().optional(),
  custodyArrangement: z.string().optional(),
  notificationPrefs: z.record(z.boolean()).optional(),
  infoRestrictions: z.array(z.string()).optional(),
});

export const collectorSchema = z.object({
  name: z.string().min(2),
  relationship: z.string().optional(),
  phone: z.string().optional(),
  photoUrl: z.string().url().optional().or(z.literal("")),
  linkedUserId: z.string().optional().nullable(),
});

export const emergencyContactSchema = z.object({
  name: z.string().min(2),
  relationship: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  priority: z.number().int().min(1).max(9).optional(),
});

export const staffCreateSchema = z.object({
  reference: z.string().min(1),
  fullName: z.string().min(2),
  email: z.string().email(),
  role: z.string().min(2),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
});

export const importSchema = z.object({
  type: z.enum([
    "students", "parents", "staff", "messaging_consent",
    "vehicles", "routes", "calendar_events", "announcements", "pupil_reports",
  ]),
  csvText: z.string().min(1),
  filename: z.string().optional(),
});

// ----------------------------------------------------------------------------
// Phase 3 — integrations
// ----------------------------------------------------------------------------

export const createIntegrationSchema = z.object({
  connectorKey: z.string().min(2),
  name: z.string().optional(),
  method: z.enum(["rest", "webhook", "scheduled", "sftp", "csv", "manual"]).optional(),
  config: z.record(z.any()).optional(),
});

export const updateIntegrationSchema = z.object({
  name: z.string().optional(),
  method: z.enum(["rest", "webhook", "scheduled", "sftp", "csv", "manual"]).optional(),
  enabled: z.boolean().optional(),
  writeBackEnabled: z.boolean().optional(),
  status: z.enum(["pending", "connected", "error", "disabled"]).optional(),
  config: z.record(z.any()).optional(),
});

export const mappingsSchema = z.object({
  mappings: z.array(
    z.object({
      domain: z.string().min(1),
      externalField: z.string().min(1),
      internalField: z.string().min(1),
      direction: z.enum(["in", "out", "both"]).optional(),
    })
  ),
});

export const runSyncSchema = z.object({
  csvText: z.string().optional(),
  importType: z.enum(["students", "parents", "staff"]).optional(),
});

export const sourcesSchema = z.object({
  sources: z.array(
    z.object({
      domain: z.string().min(1),
      sourceLabel: z.string().min(1),
      integrationId: z.string().optional().nullable(),
      writeBack: z.boolean().optional(),
    })
  ),
});

// ----------------------------------------------------------------------------
// Phase 4 — calendar, homework, consent
// ----------------------------------------------------------------------------

const isoDate = z.string().min(1); // ISO datetime string, parsed server-side

export const eventCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  startsAt: isoDate,
  endsAt: isoDate.optional().nullable(),
  allDay: z.boolean().optional(),
  location: z.string().optional(),
  audienceScope: z.enum(["school", "year", "class", "house", "club", "students"]).optional(),
  campusId: z.string().optional().nullable(),
  yearGroup: z.string().optional().nullable(),
  classId: z.string().optional().nullable(),
  house: z.string().optional().nullable(),
  club: z.string().optional().nullable(),
  equipment: z.string().optional(),
  clothing: z.string().optional(),
  packedLunch: z.boolean().optional(),
  transportRequired: z.boolean().optional(),
  collectionAt: isoDate.optional().nullable(),
  collectionLocation: z.string().optional(),
  attachments: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
  reminderOffsets: z.array(z.number().int()).optional(),
  consentRequired: z.boolean().optional(),
  paymentRef: z.string().optional(),
  status: z.enum(["draft", "published", "cancelled"]).optional(),
  studentIds: z.array(z.string()).optional(),
  staffIds: z.array(z.string()).optional(),
});

export const eventUpdateSchema = eventCreateSchema.partial();

export const homeworkSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  subject: z.string().optional(),
  dueAt: isoDate,
  classId: z.string().optional().nullable(),
  yearGroup: z.string().optional().nullable(),
});

export const consentSchema = z.object({
  eventId: z.string().min(1),
  studentId: z.string().min(1),
  decision: z.enum(["given", "declined"]).optional(),
  paymentAck: z.boolean().optional(),
});

// ----------------------------------------------------------------------------
// Phase 5 — documents & mailboxes
// ----------------------------------------------------------------------------

const dateStrOpt = z.string().optional().nullable();

export const documentCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  sourceType: z.string().optional(),
  audienceRoles: z.array(z.string()).optional(),
  campusId: z.string().optional().nullable(),
  yearGroup: z.string().optional().nullable(),
  classId: z.string().optional().nullable(),
  effectiveDate: dateStrOpt,
  reviewDate: dateStrOpt,
  expiryDate: dateStrOpt,
  fileName: z.string().optional(),
  linkUrl: z.string().optional(),
  bodyText: z.string().optional(),
  status: z.enum(["draft", "under_review", "approved", "published", "superseded", "archived"]).optional(),
});

export const documentUpdateSchema = documentCreateSchema.partial();

export const docStatusSchema = z.object({
  status: z.enum(["draft", "under_review", "approved", "published", "superseded", "archived"]),
  archived: z.boolean().optional(),
});

export const mailboxSchema = z.object({
  address: z.string().email(),
  label: z.string().optional(),
});

export const ingestSchema = z.object({
  title: z.string().min(1),
  category: z.enum(["newsletter", "email"]).optional(),
  sourceType: z.enum(["newsletter", "email"]).optional(),
  bodyText: z.string().min(1),
  audienceRoles: z.array(z.string()).optional(),
  mailboxId: z.string().optional(),
  effectiveDate: dateStrOpt,
});

// ----------------------------------------------------------------------------
// Phase 6 — AI
// ----------------------------------------------------------------------------

export const aiAskSchema = z.object({
  question: z.string().min(1),
  lang: z.string().optional(),
  schoolId: z.string().optional(),
});

export const aiDraftSchema = z.object({
  type: z.enum(["parent_notification", "event_summary", "transport_delay", "consent_reminder", "translation", "policy_summary"]),
  schoolId: z.string().optional(),
  prompt: z.string().optional(),
  refId: z.string().optional(),
  lang: z.string().optional(),
});

export const aiDraftUpdateSchema = z.object({
  status: z.enum(["confirmed", "discarded"]).optional(),
  body: z.string().optional(),
});

// ----------------------------------------------------------------------------
// Phase 7/8/9 — transport & trips
// ----------------------------------------------------------------------------

export const vehicleSchema = z.object({
  reference: z.string().min(1),
  label: z.string().optional(),
  capacity: z.number().int().min(1).max(120).optional(),
  type: z.enum(["minibus", "coach", "car"]).optional(),
  gpsSource: z.enum(["driver_phone", "vehicle_gps", "telematics", "tracking_link", "device"]).optional(),
});

export const routeSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["fixed", "flexible"]).optional(),
  vehicleId: z.string().optional().nullable(),
  driverUserId: z.string().optional().nullable(),
  cutoffTime: z.string().optional(),
  stops: z.array(z.object({
    name: z.string().min(1),
    kind: z.enum(["pickup", "dropoff", "school", "shared"]).optional(),
    address: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    plannedArrival: z.string().optional(),
  })).optional(),
});

export const routeUpdateSchema = z.object({
  name: z.string().optional(),
  vehicleId: z.string().optional().nullable(),
  driverUserId: z.string().optional().nullable(),
  cutoffTime: z.string().optional(),
  active: z.boolean().optional(),
});

export const transportProfileSchema = z.object({
  homeAddress: z.string().optional(),
  homeLat: z.number().optional().nullable(),
  homeLng: z.number().optional().nullable(),
  morningStopId: z.string().optional().nullable(),
  afternoonStopId: z.string().optional().nullable(),
  routeId: z.string().optional().nullable(),
  vehicleId: z.string().optional().nullable(),
  transportDays: z.string().optional(),
  morningOnly: z.boolean().optional(),
  afternoonOnly: z.boolean().optional(),
  accessibility: z.string().optional(),
  emergencyContact: z.string().optional(),
  approvedDropoffs: z.array(z.string()).optional(),
  altLocations: z.array(z.string()).optional(),
});

export const transportRequestSchema = z.object({
  studentId: z.string().min(1),
  date: z.string().min(1),
  session: z.enum(["day", "am", "pm"]).optional(),
  type: z.enum(["cancel", "absence", "temp_address", "change_collector", "note"]),
  payload: z.record(z.any()).optional(),
});

export const requestDecisionSchema = z.object({ status: z.enum(["approved", "rejected"]) });

export const generateJourneysSchema = z.object({ date: z.string().optional(), session: z.enum(["am", "pm"]) });

export const boardingSchema = z.object({ studentId: z.string().min(1), status: z.enum(["boarded", "absent", "not_present", "dropped_off"]) });

export const incidentSchema = z.object({ journeyId: z.string().optional(), tripId: z.string().optional(), type: z.string().min(1), notes: z.string().optional() });

export const positionSchema = z.object({ lat: z.number().optional(), lng: z.number().optional(), advance: z.boolean().optional(), delayMinutes: z.number().int().optional() });

export const tripSchema = z.object({
  title: z.string().min(1),
  purpose: z.string().optional(),
  date: z.string().min(1),
  destination: z.string().optional(),
  departurePoint: z.string().optional(),
  departureTime: z.string().optional(),
  returnTime: z.string().optional(),
  leadTeacherUserId: z.string().optional().nullable(),
  transportProvider: z.string().optional(),
  coachDetails: z.string().optional(),
  driverDetails: z.string().optional(),
  venue: z.string().optional(),
  itinerary: z.string().optional(),
  packingList: z.string().optional(),
  medicalRequirements: z.string().optional(),
  medicationReferences: z.string().optional(),
  consentRequired: z.boolean().optional(),
  paymentStatus: z.string().optional(),
  riskAssessmentRef: z.string().optional(),
  status: z.enum(["planned", "active", "completed", "cancelled"]).optional(),
  isResidential: z.boolean().optional(),
  endDate: z.string().optional().nullable(),
  accommodation: z.string().optional(),
  returnPlan: z.string().optional(),
});

export const tripAllocateSchema = z.object({
  studentIds: z.array(z.string()).optional(),
  staffIds: z.array(z.string()).optional(),
  leadTeacherUserId: z.string().optional(),
});

export const tripUpdateSchema = z.object({ type: z.string().min(1), note: z.string().optional() });
export const tripConsentSchema = z.object({ tripId: z.string().min(1), studentId: z.string().min(1), decision: z.enum(["given", "declined"]) });
export const coachAccessSchema = z.object({ driverName: z.string().min(1), hours: z.number().int().min(1).max(48).optional() });

// ----------------------------------------------------------------------------
// Phase 10 — residential trip extras
// ----------------------------------------------------------------------------

export const tripDaySchema = z.object({ date: z.string().min(1), title: z.string().optional(), itinerary: z.string().optional() });
export const tripHeadcountSchema = z.object({ kind: z.string().optional(), expected: z.number().int().min(0), present: z.number().int().min(0), note: z.string().optional() });
export const tripPhotoSchema = z.object({ url: z.string().min(1), caption: z.string().optional(), sharedWithParents: z.boolean().optional() });

// ----------------------------------------------------------------------------
// Phase 11 — rewards & home rules
// ----------------------------------------------------------------------------

export const rewardSchema = z.object({
  studentId: z.string().min(1),
  type: z.enum(["merit", "house_point", "badge", "praise", "incident", "detention", "sanction", "comment", "certificate", "attendance_award"]),
  points: z.number().int().optional(),
  category: z.string().optional(),
  note: z.string().optional(),
  teacherName: z.string().optional(),
  source: z.string().optional(),
  at: z.string().optional(),
});

export const homeRuleSchema = z.object({ studentId: z.string().min(1), threshold: z.number().int().min(1), reward: z.string().min(1) });
export const homeRuleUpdateSchema = z.object({ active: z.boolean().optional(), reward: z.string().optional(), threshold: z.number().int().min(1).optional() });

// ----------------------------------------------------------------------------
// Phase 12 — communications
// ----------------------------------------------------------------------------

export const messageSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  channels: z.array(z.enum(["inapp", "push", "email", "sms", "whatsapp"])).optional(),
  priority: z.enum(["normal", "emergency"]).optional(),
  target: z.object({
    type: z.enum(["school", "campus", "year", "class", "house", "club", "route", "vehicle", "trip", "student", "parents", "staff"]),
    value: z.string().optional(),
    audience: z.enum(["parents", "staff", "both"]).optional(),
  }),
});

export const prefsSchema = z.object({
  channels: z.record(z.boolean()).optional(),
  digest: z.enum(["immediate", "daily", "weekly"]).optional(),
  quietStart: z.string().optional().nullable(),
  quietEnd: z.string().optional().nullable(),
  preferredLanguage: z.string().optional(),
  perChild: z.record(z.any()).optional(),
  rewardPrefs: z.record(z.boolean()).optional(),
});

// ----------------------------------------------------------------------------
// Phase 13/14 — reports, privacy, DSR
// ----------------------------------------------------------------------------

export const scheduledReportSchema = z.object({
  type: z.enum(["overview", "transport", "trips", "engagement", "ai", "integrations"]),
  cadence: z.enum(["daily", "weekly", "monthly"]).optional(),
  format: z.enum(["csv", "pdf"]).optional(),
  recipients: z.string().optional(),
  scope: z.enum(["school", "leader", "trust"]).optional(),
});

export const privacySchema = z.object({
  complianceRegime: z.enum(["UK_GDPR", "FERPA"]).optional(),
  restrictMedical: z.boolean().optional(),
  restrictSend: z.boolean().optional(),
  restrictLocation: z.boolean().optional(),
  childLocationPrivacy: z.boolean().optional(),
  dataRetentionDays: z.number().int().min(30).max(3650).optional(),
});

export const dataRequestSchema = z.object({
  subjectType: z.enum(["student", "user"]),
  subjectId: z.string().min(1),
  type: z.enum(["export", "deletion"]),
  note: z.string().optional(),
});

export const emergencySchema = z.object({ title: z.string().min(1), body: z.string().optional() });

// Messaging consent (parent-managed). WhatsApp requires opt-in; SMS is opt-out.
export const messagingConsentSchema = z.object({
  channel: z.enum(["whatsapp", "sms"]),
  optIn: z.boolean(),
  phone: z.string().min(6).max(20).optional(), // E.164, e.g. +447700900123
});

// ----------------------------------------------------------------------------
// Mobile — device registration
// ----------------------------------------------------------------------------

export const deviceSchema = z.object({
  platform: z.enum(["ios", "android", "web"]),
  pushToken: z.string().min(1),
  appRole: z.enum(["parent", "teacher", "driver", "admin"]).optional(),
  appVersion: z.string().optional(),
});

// ----------------------------------------------------------------------------
// Phase 15 — pupil reports (teacher-authored, SLT-approved, scheduled release)
// ----------------------------------------------------------------------------

const PUPIL_REPORT_TYPE = z.enum(["annual", "termly", "attendance_behaviour", "custom"]);
const NOTIFY_CHANNELS = z.array(z.enum(["inapp", "push", "email", "sms", "whatsapp"])).optional();

// A single pupil's report within a create/add payload. `body` is free-form
// structured content (subjects, comments, attendance, behaviour); stored as JSON.
export const reportItemSchema = z.object({
  studentId: z.string().min(1),
  type: PUPIL_REPORT_TYPE.optional(), // defaults to the release type
  title: z.string().min(1).max(200).optional(),
  term: z.string().max(120).optional(),
  summary: z.string().max(500).optional(),
  body: z.record(z.any()).optional(),
  fileUrl: z.string().min(1).max(2000).optional(),
});

export const reportReleaseCreateSchema = z.object({
  name: z.string().min(1).max(200),
  type: PUPIL_REPORT_TYPE,
  term: z.string().max(120).optional(),
  notifyChannels: NOTIFY_CHANNELS,
  reports: z.array(reportItemSchema).max(2000).optional(),
});

export const reportAddSchema = z.object({
  reports: z.array(reportItemSchema).min(1).max(2000),
});

// Edit a report while it is still a draft/submitted (not yet released).
export const reportUpdateSchema = z.object({
  reportId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  term: z.string().max(120).optional(),
  summary: z.string().max(500).optional(),
  body: z.record(z.any()).optional(),
  fileUrl: z.string().min(1).max(2000).nullable().optional(),
});

// Lifecycle transition on a release.
//   submit       (author)  draft → submitted
//   approve      (SLT)     submitted → approved  [+releaseAt ⇒ scheduled]
//   schedule     (SLT)     approved/scheduled → scheduled (set/adjust embargo)
//   release_now  (SLT)     approved/scheduled → released immediately
//   withdraw     (SLT)     any → withdrawn (hidden from parents again)
export const reportTransitionSchema = z.object({
  action: z.enum(["submit", "approve", "schedule", "release_now", "withdraw"]),
  releaseAt: z.string().datetime().optional(),
  notifyChannels: NOTIFY_CHANNELS,
});

// ----------------------------------------------------------------------------
// Phase 16 — Integration Hub
// ----------------------------------------------------------------------------

export const hubCredentialSchema = z.object({
  integrationId: z.string().min(1),
  authMethod: z.enum(["none", "api_key", "bearer", "basic", "oauth2", "client_credentials", "custom_header", "sftp_key", "signature"]),
  secret: z.string().min(1),          // single token OR JSON bundle of secret fields
  expiresAt: z.string().datetime().nullable().optional(),
});

export const hubTestSchema = z.object({ integrationId: z.string().min(1) });

const transformSpecSchema = z.object({
  type: z.enum(["trim", "upper", "lower", "title", "date", "time", "boolean", "number", "concat", "split", "replace", "lookup", "default", "phone", "address"]),
  format: z.string().optional(), with: z.string().optional(), from: z.string().optional(),
  index: z.number().int().optional(), map: z.record(z.string()).optional(),
  value: z.string().optional(), trueValues: z.array(z.string()).optional(),
});

export const hubMappingSuggestSchema = z.object({
  objectFilter: z.string().optional(),
  fields: z.array(z.object({ name: z.string().min(1), samples: z.array(z.string()).optional() })).min(1).max(200),
});

export const hubImportSchema = z.object({
  integrationId: z.string().optional(),
  connectorKey: z.string().min(1),
  sourceSystem: z.string().min(1),
  format: z.enum(["csv", "json"]),
  raw: z.string().min(1),
  targetObject: z.literal("student"),
  mapping: z.array(z.object({ externalField: z.string().min(1), internalField: z.string().min(1), transforms: z.array(transformSpecSchema).optional() })).min(1),
});

export const hubErrorActionSchema = z.object({
  errorId: z.string().min(1),
  action: z.enum(["retry", "ignore", "resolve", "assign"]),
  notes: z.string().max(2000).optional(),
  assignedToId: z.string().optional(),
});

// Behaviour ingestion (Phase 16) — external rewards/consequences from a connector.
export const behaviourEventSchema = z.object({
  externalId: z.string().min(1),
  externalRef: z.string().min(1),
  type: z.string().optional(),
  kind: z.string().optional(),
  points: z.union([z.number(), z.string()]).optional(),
  note: z.string().max(1000).optional(),
  teacherName: z.string().max(120).optional(),
  at: z.string().optional(),
});
export const behaviourIngestSchema = z.object({
  source: z.string().min(1),
  integrationId: z.string().optional(),
  events: z.array(behaviourEventSchema).min(1).max(1000),
});

// Invitations & onboarding (Phase 17)
export const inviteCreateSchema = z.object({
  email: z.string().email(),
  role: z.enum(SCHOOL_ROLES as [string, ...string[]]),
  studentRefs: z.array(z.string()).optional(),
  requireMfa: z.boolean().optional(),
});
export const inviteAcceptSchema = z.object({
  token: z.string().min(1),
  code: z.string().min(4),
  fullName: z.string().min(2),
  password: z.string().min(8),
  acceptTerms: z.literal(true),
});
export const userActionSchema = z.object({
  action: z.enum(["disable", "suspend", "reactivate", "revoke", "reset_password"]),
});

// CRM, campaigns, website capture, CMS video, parent subscriptions (Phase 17)
export const AUDIENCE_KEYS = ["subscriber", "parent", "driver", "tenant_admin", "teacher", "transport_manager", "lead"] as const;

// Public website "subscribe now" capture — deliberately minimal + tolerant.
export const subscribeSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  interest: z.string().max(500).optional(),
  schoolSlug: z.string().max(120).optional(),
  consent: z.boolean().optional(),
  source: z.string().max(40).optional(),
});

export const crmContactSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  audience: z.enum(AUDIENCE_KEYS).optional(),
  interest: z.string().max(500).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  consent: z.boolean().optional(),
});

export const audienceFilterSchema = z.object({
  audiences: z.array(z.enum(AUDIENCE_KEYS)).optional(),
  schoolIds: z.array(z.string()).optional(),
  status: z.string().max(20).optional(),
  tags: z.array(z.string().max(40)).optional(),
  consentRequired: z.boolean().optional(),
});

export const campaignCreateSchema = z.object({
  name: z.string().min(2).max(160),
  subject: z.string().min(1).max(200),
  body: z.string().max(50000).optional(),
  fromName: z.string().max(120).optional(),
  fromEmail: z.string().email().optional(),
  segmentId: z.string().optional(),
  audience: audienceFilterSchema.optional(),
  scheduledFor: z.string().datetime().optional(),
});
export const campaignActionSchema = z.object({
  action: z.enum(["send", "schedule", "cancel", "test"]),
  scheduledFor: z.string().datetime().optional(),
  testEmail: z.string().email().optional(),
});

export const routeDriversSchema = z.object({
  drivers: z.array(z.object({
    driverUserId: z.string().min(1),
    role: z.enum(["primary", "relief", "secondary"]).optional(),
    session: z.enum(["all", "am", "pm"]).optional(),
  })).min(1).max(10),
});

export const helpVideoSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  category: z.enum(["getting_started", "parents", "staff", "transport", "integrations", "admin"]).optional(),
  audience: z.enum(["all", "parent", "staff", "admin", "driver"]).optional(),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  durationSec: z.number().int().min(0).max(36000).optional(),
  transcript: z.string().max(20000).optional(),
  sequence: z.number().int().optional(),
  published: z.boolean().optional(),
});

export const parentSubSchema = z.object({
  parentUserId: z.string().min(1),
  schoolId: z.string().optional(),
  planKey: z.enum(["parent_premium", "family", "trial"]).optional(),
  status: z.enum(["trialing", "active", "past_due", "canceled"]).optional(),
  amountMinor: z.number().int().min(0).max(1000000).optional(),
  currency: z.string().length(3).optional(),
  interval: z.enum(["month", "year"]).optional(),
  stripeCustomerRef: z.string().max(120).optional(),
  stripeSubRef: z.string().max(120).optional(),
});

// Phase 17b — templates, staff RBAC, subscription approval, campaign actions
export const templateSchema = z.object({
  kind: z.enum(["email_campaign", "message_board", "email_notification"]).optional(),
  name: z.string().min(2).max(160),
  category: z.string().max(60).optional(),
  audience: z.string().max(40).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().max(50000).optional(),
  channels: z.array(z.enum(["inapp", "email", "push", "sms", "whatsapp"])).optional(),
  sharedWithTenants: z.boolean().optional(),
});
export const templatePatchSchema = templateSchema.partial();

export const previewSchema = z.object({
  subject: z.string().max(200).optional(),
  body: z.string().max(50000),
  vars: z.record(z.string()).optional(),
});

export const platformStaffSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  name: z.string().max(120).optional(),
  roleKey: z.string().min(1),
  status: z.enum(["active", "suspended", "invited"]).optional(),
});
export const platformStaffPatchSchema = z.object({
  roleKey: z.string().min(1).optional(),
  status: z.enum(["active", "suspended", "invited"]).optional(),
});

export const subApprovalSchema = z.object({
  type: z.enum(["school", "parent"]),
  action: z.enum(["set_mode", "approve", "reject"]),
  mode: z.enum(["auto", "manual"]).optional(),
});

// Extend campaign actions with duplicate + preview (superset of the earlier enum).
export const campaignActionSchema2 = z.object({
  action: z.enum(["send", "schedule", "cancel", "test", "duplicate"]),
  scheduledFor: z.string().datetime().optional(),
  testEmail: z.string().email().optional(),
});

// Phase 17c — PII grants, policies, announcements, event updates, email, chat, reports
export const piiGrantSchema = z.object({
  grantedToUserId: z.string().min(1),
  ttlMinutes: z.number().int().min(5).max(1440).optional(),
  scope: z.string().max(80).optional(),
  reason: z.string().max(500).optional(),
});
export const policySchema = z.object({
  title: z.string().min(2).max(200),
  category: z.enum(["safeguarding", "data_protection", "behaviour", "transport", "general"]).optional(),
  audience: z.enum(["all", "parents", "teachers", "staff"]).optional(),
  version: z.string().max(20).optional(),
  summary: z.string().max(2000).optional(),
  body: z.string().max(100000).optional(),
  fileUrl: z.string().url().optional(),
  requireAck: z.boolean().optional(),
  effectiveDate: z.string().datetime().optional(),
  published: z.boolean().optional(),
});
export const announcementSchema = z.object({
  title: z.string().min(2).max(200),
  body: z.string().min(1).max(20000),
  audience: z.object({
    kind: z.enum(["all", "year", "class", "list"]),
    years: z.array(z.string()).optional(),
    classes: z.array(z.string()).optional(),
    userIds: z.array(z.string()).optional(),
  }),
  channels: z.array(z.enum(["inapp", "email", "whatsapp", "sms"])).optional(),
});
export const tripEventUpdateSchema = z.object({
  tripId: z.string().min(1),
  type: z.string().min(1).max(60),
  note: z.string().max(1000).optional(),
});
export const eventConfigSchema = z.object({
  tripId: z.string().min(1),
  removed: z.array(z.string()).optional(),
  custom: z.array(z.object({ label: z.string().min(1).max(40), icon: z.string().max(8).optional() })).optional(),
});
export const emailConfigSchema = z.object({
  provider: z.enum(["console", "smtp", "postmark", "ses", "resend"]),
  fromName: z.string().max(120).optional(),
  fromEmail: z.string().email().optional(),
  host: z.string().max(200).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().max(200).optional(),
  secret: z.string().max(500).optional(),
});
export const supportChatSchema = z.object({
  schoolId: z.string().min(1),
  subject: z.string().min(2).max(200),
  withUserId: z.string().optional(),
  message: z.string().max(4000).optional(),
});
export const chatMessageSchema = z.object({ body: z.string().min(1).max(4000) });
export const reportRunSchema = z.object({
  type: z.enum(["usage", "subscription", "engagement", "event_tracking", "adoption", "parent_child"]),
  scope: z.enum(["platform", "tenant", "parent"]).optional(),
  schoolId: z.string().optional(),
  format: z.enum(["json", "csv"]).optional(),
  params: z.record(z.any()).optional(),
});
