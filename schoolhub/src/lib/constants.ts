// Central definitions for roles, permissions, plans, modules and audit actions.
// Modelled as const objects (not Prisma enums) so the schema stays portable
// across SQLite (dev) and Postgres (prod).

export const ROLES = {
  PLATFORM_SUPER_ADMIN: "PlatformSuperAdministrator",
  SCHOOL_ADMIN: "SchoolAdministrator",
  SCHOOL_LEADER: "SchoolLeader",
  TEACHER: "Teacher",
  TRANSPORT_MANAGER: "TransportManager",
  DRIVER: "Driver",
  PARENT: "Parent",
  SUPPORT_STAFF: "SupportStaff",
  INTEGRATION_ADMIN: "IntegrationAdministrator",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

// Roles that can be assigned within a school (excludes the platform-level role).
export const SCHOOL_ROLES: Role[] = [
  ROLES.SCHOOL_ADMIN,
  ROLES.SCHOOL_LEADER,
  ROLES.TEACHER,
  ROLES.TRANSPORT_MANAGER,
  ROLES.DRIVER,
  ROLES.PARENT,
  ROLES.SUPPORT_STAFF,
  ROLES.INTEGRATION_ADMIN,
];

export const ROLE_LABELS: Record<string, string> = {
  [ROLES.PLATFORM_SUPER_ADMIN]: "Platform Super Administrator",
  [ROLES.SCHOOL_ADMIN]: "School Administrator",
  [ROLES.SCHOOL_LEADER]: "School Leader",
  [ROLES.TEACHER]: "Teacher",
  [ROLES.TRANSPORT_MANAGER]: "Transport Manager",
  [ROLES.DRIVER]: "Driver",
  [ROLES.PARENT]: "Parent / Guardian",
  [ROLES.SUPPORT_STAFF]: "Support Staff",
  [ROLES.INTEGRATION_ADMIN]: "Authorised Integration Administrator",
};

// Roles for which MFA is required (privileged users, per Phase 1 spec).
export const MFA_REQUIRED_ROLES: Role[] = [
  ROLES.PLATFORM_SUPER_ADMIN,
  ROLES.SCHOOL_ADMIN,
  ROLES.SCHOOL_LEADER,
  ROLES.INTEGRATION_ADMIN, // handles credentials — privileged
];

// ----------------------------------------------------------------------------
// Permissions — coarse-grained capability flags checked by the RBAC layer.
// ----------------------------------------------------------------------------

export const PERMISSIONS = {
  MANAGE_PLATFORM: "manage_platform",       // create/suspend tenants, global config
  MANAGE_SCHOOL_CONFIG: "manage_school_config",
  MANAGE_USERS: "manage_users",
  MANAGE_INTEGRATIONS: "manage_integrations",
  MANAGE_INTEGRATION_HUB: "manage_integration_hub", // Integration Hub admin area

  MANAGE_SUBSCRIPTION: "manage_subscription",
  VIEW_DASHBOARDS: "view_dashboards",
  VIEW_REPORTS: "view_reports",
  VIEW_AUDIT: "view_audit",
  MANAGE_CALENDAR: "manage_calendar",
  MANAGE_KNOWLEDGE: "manage_knowledge",
  MANAGE_TRANSPORT: "manage_transport",
  MANAGE_TRIPS: "manage_trips",
  DRIVE_ROUTES: "drive_routes",
  AUTHOR_REPORTS: "author_reports",   // draft/submit pupil reports
  RELEASE_REPORTS: "release_reports", // approve + schedule + release to parents
  VIEW_OWN_CHILDREN: "view_own_children",
  VIEW_ASSIGNED_STUDENTS: "view_assigned_students",
  MANAGE_CRM: "manage_crm",             // CRM contacts + email campaigns
  MANAGE_CONTENT: "manage_content",     // content management (how-to videos)
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Role -> permissions mapping.
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  [ROLES.PLATFORM_SUPER_ADMIN]: [PERMISSIONS.MANAGE_PLATFORM, PERMISSIONS.VIEW_AUDIT, PERMISSIONS.MANAGE_CRM, PERMISSIONS.MANAGE_CONTENT],
  [ROLES.SCHOOL_ADMIN]: [
    PERMISSIONS.MANAGE_SCHOOL_CONFIG,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_INTEGRATIONS,
    PERMISSIONS.MANAGE_INTEGRATION_HUB,
    PERMISSIONS.MANAGE_SUBSCRIPTION,
    PERMISSIONS.VIEW_DASHBOARDS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.VIEW_AUDIT,
    PERMISSIONS.MANAGE_CALENDAR,
    PERMISSIONS.MANAGE_KNOWLEDGE,
    PERMISSIONS.MANAGE_TRANSPORT,
    PERMISSIONS.MANAGE_TRIPS,
    PERMISSIONS.AUTHOR_REPORTS,
    PERMISSIONS.RELEASE_REPORTS,
    PERMISSIONS.MANAGE_CRM,
    PERMISSIONS.MANAGE_CONTENT,
  ],
  [ROLES.SCHOOL_LEADER]: [PERMISSIONS.VIEW_DASHBOARDS, PERMISSIONS.VIEW_REPORTS, PERMISSIONS.MANAGE_CALENDAR, PERMISSIONS.MANAGE_KNOWLEDGE, PERMISSIONS.MANAGE_TRIPS, PERMISSIONS.AUTHOR_REPORTS, PERMISSIONS.RELEASE_REPORTS],
  [ROLES.TEACHER]: [PERMISSIONS.VIEW_ASSIGNED_STUDENTS, PERMISSIONS.MANAGE_CALENDAR, PERMISSIONS.MANAGE_TRIPS, PERMISSIONS.AUTHOR_REPORTS],
  [ROLES.TRANSPORT_MANAGER]: [PERMISSIONS.MANAGE_TRANSPORT, PERMISSIONS.VIEW_DASHBOARDS],
  [ROLES.DRIVER]: [PERMISSIONS.DRIVE_ROUTES],
  [ROLES.PARENT]: [PERMISSIONS.VIEW_OWN_CHILDREN],
  [ROLES.SUPPORT_STAFF]: [PERMISSIONS.VIEW_DASHBOARDS],
  // Authorised Integration Administrator — scoped to the Integration Hub only.
  [ROLES.INTEGRATION_ADMIN]: [
    PERMISSIONS.MANAGE_INTEGRATION_HUB,
    PERMISSIONS.MANAGE_INTEGRATIONS,
    PERMISSIONS.VIEW_DASHBOARDS,
    PERMISSIONS.VIEW_AUDIT,
  ],
};

// ----------------------------------------------------------------------------
// Modules & plans
// ----------------------------------------------------------------------------

export const MODULES = {
  DASHBOARD: "dashboard",
  CALENDAR: "calendar",
  TRANSPORT: "transport",
  TRIPS: "trips",
  COMMS: "comms",
  AI: "ai",
} as const;

export const ALL_MODULES = Object.values(MODULES);

export const PLAN_KEYS = ["trial", "basic", "standard", "premium"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const SCHOOL_STATUSES = ["trial", "active", "suspended", "archived"] as const;
export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "suspended",
] as const;

// ----------------------------------------------------------------------------
// Audit actions
// ----------------------------------------------------------------------------

export const AUDIT = {
  USER_LOGIN: "USER_LOGIN",
  USER_LOGIN_FAILED: "USER_LOGIN_FAILED",
  USER_LOGOUT: "USER_LOGOUT",
  ACCOUNT_CREATED: "ACCOUNT_CREATED",
  ACCOUNT_CHANGED: "ACCOUNT_CHANGED",
  PERMISSION_CHANGED: "PERMISSION_CHANGED",
  DATA_CHANGE: "DATA_CHANGE",
  INTEGRATION_ACTIVITY: "INTEGRATION_ACTIVITY",
  DOCUMENT_ACCESS: "DOCUMENT_ACCESS",
  AI_QUERY: "AI_QUERY",
  NOTIFICATION_SENT: "NOTIFICATION_SENT",
  TRANSPORT_STATUS_CHANGE: "TRANSPORT_STATUS_CHANGE",
  EMAIL_VERIFIED: "EMAIL_VERIFIED",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  PASSWORD_RESET_COMPLETED: "PASSWORD_RESET_COMPLETED",
  MFA_ENABLED: "MFA_ENABLED",
  MFA_DISABLED: "MFA_DISABLED",
  TENANT_CREATED: "TENANT_CREATED",
  TENANT_SUSPENDED: "TENANT_SUSPENDED",
  TENANT_REACTIVATED: "TENANT_REACTIVATED",
  SUBSCRIPTION_CHANGED: "SUBSCRIPTION_CHANGED",
  CONFIG_CHANGED: "CONFIG_CHANGED",
  STUDENT_CREATED: "STUDENT_CREATED",
  STUDENT_UPDATED: "STUDENT_UPDATED",
  GUARDIAN_LINKED: "GUARDIAN_LINKED",
  COLLECTOR_CHANGED: "COLLECTOR_CHANGED",
  STAFF_CHANGED: "STAFF_CHANGED",
  DATA_IMPORT: "DATA_IMPORT",
  INTEGRATION_CONNECTED: "INTEGRATION_CONNECTED",
  INTEGRATION_CREATED: "INTEGRATION_CREATED",
  INTEGRATION_DISABLED: "INTEGRATION_DISABLED",
  INTEGRATION_REMOVED: "INTEGRATION_REMOVED",
  MAPPING_CHANGED: "MAPPING_CHANGED",
  SOURCE_CHANGED: "SOURCE_CHANGED",
  WEBHOOK_RECEIVED: "WEBHOOK_RECEIVED",
  EVENT_CHANGED: "EVENT_CHANGED",
  HOMEWORK_CHANGED: "HOMEWORK_CHANGED",
  CONSENT_RESPONDED: "CONSENT_RESPONDED",
  DOCUMENT_CHANGED: "DOCUMENT_CHANGED",
  MAILBOX_INGEST: "MAILBOX_INGEST",
  AI_DRAFT: "AI_DRAFT",
  DRAFT_CONFIRMED: "DRAFT_CONFIRMED",
  TRANSPORT_CHANGED: "TRANSPORT_CHANGED",
  TRANSPORT_REQUEST: "TRANSPORT_REQUEST",
  JOURNEY_EVENT: "JOURNEY_EVENT",
  INCIDENT_REPORTED: "INCIDENT_REPORTED",
  TRIP_CHANGED: "TRIP_CHANGED",
  TRIP_UPDATE: "TRIP_UPDATE",
  TRIP_HEADCOUNT: "TRIP_HEADCOUNT",
  REWARD_INGEST: "REWARD_INGEST",
  REWARD_CHANGED: "REWARD_CHANGED",
  AI_CONFIG_CHANGED: "AI_CONFIG_CHANGED",
  HOME_RULE: "HOME_RULE",
  MESSAGE_SENT: "MESSAGE_SENT",
  PREFS_CHANGED: "PREFS_CHANGED",
  REPORT_RUN: "REPORT_RUN",
  RATE_LIMITED: "RATE_LIMITED",
  SESSIONS_REVOKED: "SESSIONS_REVOKED",
  SAFEGUARDING: "SAFEGUARDING",
  EMERGENCY_ALERT: "EMERGENCY_ALERT",
  DSR_CREATED: "DSR_CREATED",
  DSR_FULFILLED: "DSR_FULFILLED",
  RETENTION_PURGE: "RETENTION_PURGE",
  PRIVACY_CHANGED: "PRIVACY_CHANGED",
  DEVICE_REGISTERED: "DEVICE_REGISTERED",
  INVITE_CREATED: "INVITE_CREATED",
  INVITE_RESENT: "INVITE_RESENT",
  INVITE_REVOKED: "INVITE_REVOKED",
  INVITE_ACCEPTED: "INVITE_ACCEPTED",
  USER_DISABLED: "USER_DISABLED",
  USER_SUSPENDED: "USER_SUSPENDED",
  USER_REACTIVATED: "USER_REACTIVATED",
  USER_ACCESS_REVOKED: "USER_ACCESS_REVOKED",
  WHATSAPP_OPT_IN: "WHATSAPP_OPT_IN",
  WHATSAPP_OPT_OUT: "WHATSAPP_OPT_OUT",
  SMS_OPT_IN: "SMS_OPT_IN",
  SMS_OPT_OUT: "SMS_OPT_OUT",
  MESSAGE_RECEIPT: "MESSAGE_RECEIPT",
  CONSENT_IMPORT: "CONSENT_IMPORT",
  REPORT_DRAFTED: "REPORT_DRAFTED",
  REPORT_SUBMITTED: "REPORT_SUBMITTED",
  REPORT_APPROVED: "REPORT_APPROVED",
  REPORT_SCHEDULED: "REPORT_SCHEDULED",
  REPORT_RELEASED: "REPORT_RELEASED",
  REPORT_WITHDRAWN: "REPORT_WITHDRAWN",
  REPORT_VIEWED: "REPORT_VIEWED",
  // Integration Hub (Phase 16)
  HUB_CONNECTOR_CREATED: "HUB_CONNECTOR_CREATED",
  HUB_CREDENTIAL_SET: "HUB_CREDENTIAL_SET",
  HUB_CREDENTIAL_ROTATED: "HUB_CREDENTIAL_ROTATED",
  HUB_CONNECTION_TESTED: "HUB_CONNECTION_TESTED",
  HUB_SYNC_STARTED: "HUB_SYNC_STARTED",
  HUB_SYNC_COMPLETED: "HUB_SYNC_COMPLETED",
  HUB_MAPPING_SUGGESTED: "HUB_MAPPING_SUGGESTED",
  HUB_CONFLICT_RESOLVED: "HUB_CONFLICT_RESOLVED",
  HUB_DUPLICATE_RESOLVED: "HUB_DUPLICATE_RESOLVED",
  HUB_ERROR_RESOLVED: "HUB_ERROR_RESOLVED",
  HUB_WRITE_BACK: "HUB_WRITE_BACK",
  HUB_WEBHOOK_DELIVERY: "HUB_WEBHOOK_DELIVERY",
  HUB_SOURCE_APPROVED: "HUB_SOURCE_APPROVED",
  // Phase 17 — CRM, campaigns, website capture, CMS, parent subscriptions
  CONTACT_CAPTURED: "CONTACT_CAPTURED",
  CONTACT_UNSUBSCRIBED: "CONTACT_UNSUBSCRIBED",
  CONTACT_IMPORTED: "CONTACT_IMPORTED",
  CAMPAIGN_CREATED: "CAMPAIGN_CREATED",
  CAMPAIGN_SCHEDULED: "CAMPAIGN_SCHEDULED",
  CAMPAIGN_SENT: "CAMPAIGN_SENT",
  CAMPAIGN_CANCELLED: "CAMPAIGN_CANCELLED",
  ROUTE_DRIVERS_SET: "ROUTE_DRIVERS_SET",
  VIDEO_CREATED: "VIDEO_CREATED",
  VIDEO_PUBLISHED: "VIDEO_PUBLISHED",
  VIDEO_REMOVED: "VIDEO_REMOVED",
  PARENT_SUB_CHANGED: "PARENT_SUB_CHANGED",
  CAMPAIGN_DUPLICATED: "CAMPAIGN_DUPLICATED",
  // Phase 17b
  TEMPLATE_CREATED: "TEMPLATE_CREATED",
  TEMPLATE_UPDATED: "TEMPLATE_UPDATED",
  TEMPLATE_DELETED: "TEMPLATE_DELETED",
  TEMPLATE_SHARED: "TEMPLATE_SHARED",
  STAFF_ADDED: "STAFF_ADDED",
  STAFF_UPDATED: "STAFF_UPDATED",
  STAFF_REMOVED: "STAFF_REMOVED",
  SUB_APPROVAL_CHANGED: "SUB_APPROVAL_CHANGED",
  // Phase 17c
  PII_GRANT_CREATED: "PII_GRANT_CREATED",
  PII_GRANT_REVOKED: "PII_GRANT_REVOKED",
  PII_UNMASK_VIEWED: "PII_UNMASK_VIEWED",
  POLICY_CREATED: "POLICY_CREATED",
  POLICY_PUBLISHED: "POLICY_PUBLISHED",
  POLICY_REMOVED: "POLICY_REMOVED",
  POLICY_ACKNOWLEDGED: "POLICY_ACKNOWLEDGED",
  CMS_PAGE_SAVED: "CMS_PAGE_SAVED",
  CMS_PAGE_REMOVED: "CMS_PAGE_REMOVED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",
  ANNOUNCEMENT_CREATED: "ANNOUNCEMENT_CREATED",
  ANNOUNCEMENT_SENT: "ANNOUNCEMENT_SENT",
  EVENT_UPDATE_POSTED: "EVENT_UPDATE_POSTED",
  EMAIL_CONFIG_CHANGED: "EMAIL_CONFIG_CHANGED",
  SUPPORT_CHAT_OPENED: "SUPPORT_CHAT_OPENED",
  SUPPORT_CHAT_MESSAGE: "SUPPORT_CHAT_MESSAGE",
  REPORT_GENERATED: "REPORT_GENERATED",
  // Commercial / onboarding chain
  PO_CREATED: "PO_CREATED",
  PO_UPDATED: "PO_UPDATED",
  PO_SENT: "PO_SENT",
  PO_RESENT: "PO_RESENT",
  PO_CANCELLED: "PO_CANCELLED",
  PO_DOWNLOADED: "PO_DOWNLOADED",
  DISCOUNT_APPLIED: "DISCOUNT_APPLIED",
  PAYMENT_SUBMITTED: "PAYMENT_SUBMITTED",
  PAYMENT_APPROVED: "PAYMENT_APPROVED",
  PAYMENT_REJECTED: "PAYMENT_REJECTED",
  ACCOUNT_ACTIVATED: "ACCOUNT_ACTIVATED",
  ACCOUNT_MANUAL_ACTIVATED: "ACCOUNT_MANUAL_ACTIVATED",
  DOWNLOAD_RECORDED: "DOWNLOAD_RECORDED",
} as const;

// ----------------------------------------------------------------------------
// Phase 13/14 — reporting, compliance
// ----------------------------------------------------------------------------

export const REPORT_TYPES = ["overview", "transport", "trips", "engagement", "ai", "integrations"] as const;
export const REPORT_LABELS: Record<string, string> = {
  overview: "Operations overview", transport: "Transport", trips: "Trips", engagement: "Parent engagement",
  ai: "AI usage", integrations: "Integrations",
};

// Pupil report cards released to parents (Phase 15). Distinct from the analytic
// REPORT_TYPES above.
export const PUPIL_REPORT_TYPES = ["annual", "termly", "attendance_behaviour", "custom"] as const;
export type PupilReportType = (typeof PUPIL_REPORT_TYPES)[number];
export const PUPIL_REPORT_LABELS: Record<string, string> = {
  annual: "Annual report card",
  termly: "Termly / progress report",
  attendance_behaviour: "Attendance & behaviour summary",
  custom: "Custom report",
};
// Report lifecycle. Parents see a report only once it is effectively released.
export const REPORT_STATUSES = ["draft", "submitted", "approved", "scheduled", "released", "withdrawn"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const COMPLIANCE_REGIMES = ["UK_GDPR", "FERPA"] as const;

// ----------------------------------------------------------------------------
// Phase 7/8/9 — transport & trips
// ----------------------------------------------------------------------------

export const GPS_SOURCES = ["driver_phone", "vehicle_gps", "telematics", "tracking_link", "device"] as const;
export const JOURNEY_STATUSES = ["scheduled", "started", "approaching", "completed", "cancelled"] as const;
export const BOARDING_STATUSES = ["boarded", "absent", "not_present", "dropped_off"] as const;

export const TRANSPORT_REQUEST_TYPES = ["cancel", "absence", "temp_address", "change_collector", "note"] as const;

export const NOTIFY = {
  EXPECTED_TIME: "expected_time",
  ROUTE_STARTED: "route_started",
  APPROACHING: "approaching",
  ARRIVED: "arrived",
  BOARDED: "boarded",
  ARRIVED_SCHOOL: "arrived_school",
  BOARDED_RETURN: "boarded_return",
  ETA_UPDATED: "eta_updated",
  DROPPED_OFF: "dropped_off",
  JOURNEY_COMPLETE: "journey_complete",
  TRIP_UPDATE: "trip_update",
} as const;

export const TRIP_STATUSES = ["planned", "active", "completed", "cancelled"] as const;

export const TRIP_UPDATE_TYPES = [
  "students_assembled", "all_accounted", "coach_departed", "arrived_safely", "activity_started",
  "lunch_completed", "activity_completed", "leaving_venue", "running_late", "coach_issue",
  "return_started", "returned",
] as const;

export const TRIP_UPDATE_LABELS: Record<string, string> = {
  students_assembled: "Students assembled", all_accounted: "All students accounted for", coach_departed: "Coach departed",
  arrived_safely: "Arrived safely", activity_started: "Activity started", lunch_completed: "Lunch completed",
  activity_completed: "Activity completed", leaving_venue: "Leaving venue", running_late: "Running late",
  coach_issue: "Coach issue", return_started: "Return journey started", returned: "Returned to school",
  // Residential (Phase 10)
  arrival_accommodation: "Arrived at accommodation", welfare_check: "Daily welfare check", evening_update: "Evening update",
  departure_home: "Departed for home", return_eta: "Return ETA update", emergency_update: "Emergency update", all_present: "All students present",
};

// ----------------------------------------------------------------------------
// Phase 11 — rewards & behaviour
// ----------------------------------------------------------------------------

export const REWARD_TYPES = ["merit", "house_point", "badge", "praise", "incident", "detention", "sanction", "comment", "certificate", "attendance_award"] as const;
export const REWARD_TYPE_LABELS: Record<string, string> = {
  merit: "Merit point", house_point: "House point", badge: "Achievement badge", praise: "Teacher praise",
  incident: "Behaviour incident", detention: "Detention", sanction: "Sanction", comment: "Teacher comment",
  certificate: "Certificate", attendance_award: "Attendance award",
};
export const POSITIVE_REWARD_TYPES = ["merit", "house_point", "badge", "praise", "certificate", "attendance_award"];

// ----------------------------------------------------------------------------
// Phase 12 — communications
// ----------------------------------------------------------------------------

export const CHANNELS = ["inapp", "push", "email", "sms", "whatsapp"] as const;
export const MESSAGE_PRIORITIES = ["normal", "emergency"] as const;
export const DIGEST_OPTIONS = ["immediate", "daily", "weekly"] as const;
export const TARGET_TYPES = ["school", "campus", "year", "class", "house", "club", "route", "vehicle", "trip", "student", "parents", "staff"] as const;
export const DELIVERY_STATUSES = ["queued", "sent", "delivered", "read", "failed", "acknowledged"] as const;

// ----------------------------------------------------------------------------
// Phase 5 — Knowledge Hub
// ----------------------------------------------------------------------------

export const DOCUMENT_CATEGORIES = [
  "policy", "parent_handbook", "student_handbook", "uniform", "behaviour", "attendance",
  "safeguarding", "transport", "trip", "menu", "term_dates", "newsletter", "emergency", "faq",
] as const;

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  policy: "School policy", parent_handbook: "Parent handbook", student_handbook: "Student handbook",
  uniform: "Uniform policy", behaviour: "Behaviour policy", attendance: "Attendance policy",
  safeguarding: "Safeguarding", transport: "Transport guidance", trip: "Trip information",
  menu: "Lunch menu", term_dates: "Term dates", newsletter: "Newsletter", emergency: "Emergency procedures",
  faq: "FAQ",
};

export const DOCUMENT_STATUSES = ["draft", "under_review", "approved", "published", "superseded", "archived"] as const;
export const DOC_SOURCE_TYPES = ["pdf", "docx", "text", "image", "link", "email", "newsletter", "letter"] as const;

// Documents a parent may see: published (and approved) with a parent audience.
export const PARENT_VISIBLE_STATUSES = ["published"] as const;

export const INTEGRATION_STATUSES = ["pending", "connected", "error", "disabled"] as const;

// ----------------------------------------------------------------------------
// Phase 4 — calendar
// ----------------------------------------------------------------------------

export const EVENT_CATEGORIES = [
  "academic", "term", "holiday", "inset", "exam", "parents_evening", "sports_day",
  "trip", "assembly", "club", "performance", "photos", "fundraiser",
  "early_closure", "timetable_change", "event",
] as const;

export const EVENT_CATEGORY_LABELS: Record<string, string> = {
  academic: "Academic", term: "Term date", holiday: "Holiday", inset: "INSET day",
  exam: "Exam", parents_evening: "Parents' evening", sports_day: "Sports day",
  trip: "School trip", assembly: "Assembly", club: "Club", performance: "Performance",
  photos: "School photographs", fundraiser: "Fundraiser", early_closure: "Early closure",
  timetable_change: "Timetable change", event: "Event",
};

export const AUDIENCE_SCOPES = ["school", "year", "class", "house", "club", "students"] as const;

// ----------------------------------------------------------------------------
// Phase 2 — people & data model reference values
// ----------------------------------------------------------------------------

export const STUDENT_STATUSES = ["applicant", "enrolled", "leaver", "archived"] as const;

export const RELATIONSHIP_TYPES = [
  "Mother",
  "Father",
  "Parent",
  "Guardian",
  "Carer",
  "Grandparent",
  "Step-parent",
  "Foster carer",
  "Other",
] as const;

// A small illustrative set of preferred languages (ISO 639-1 codes).
export const LANGUAGES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  pl: "Polish",
  ur: "Urdu",
  ar: "Arabic",
  bn: "Bengali",
  so: "Somali",
  ro: "Romanian",
  pt: "Portuguese",
};

export const NOTIFICATION_CHANNELS = ["email", "sms", "whatsapp", "push"] as const;

// Information categories a guardian can be restricted from receiving.
export const INFO_CATEGORIES = [
  "medical",
  "behaviour",
  "attendance",
  "safeguarding",
  "academic",
  "transport",
] as const;

export const IMPORT_TYPES = [
  "students", "parents", "staff", "messaging_consent",
  "vehicles", "routes", "calendar_events", "announcements", "pupil_reports", "menus", "trips", "attendance",
  "clubs_activities", "timetables", "behaviour", "knowledge_base",
] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

// Human labels for each import type (used in module import panels).
export const IMPORT_TYPE_LABELS: Record<string, string> = {
  students: "Students", parents: "Parents / guardians", staff: "Staff",
  messaging_consent: "Messaging consent (SMS/WhatsApp opt-in)",
  vehicles: "Vehicles (fleet)", routes: "Transport routes",
  calendar_events: "Calendar & timetable events", announcements: "Announcements",
  pupil_reports: "Pupil reports", menus: "Meals & menus", trips: "Trips & events", attendance: "Attendance",
  clubs_activities: "Clubs & activities", timetables: "Class timetables", behaviour: "Behaviour records", knowledge_base: "Knowledge base",
};
