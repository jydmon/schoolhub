// Connector catalog. This is the static registry of external systems SchoolHub
// knows how to talk to. A school creates an Integration (DB row) from one of
// these templates; the template supplies the default field mappings, supported
// methods, the data domains it owns, and its source-of-truth label.

export const INTEGRATION_METHODS = ["rest", "webhook", "scheduled", "sftp", "csv", "manual"] as const;
export type IntegrationMethod = (typeof INTEGRATION_METHODS)[number];

export const METHOD_LABELS: Record<string, string> = {
  rest: "REST API",
  webhook: "Webhook",
  scheduled: "Scheduled API sync",
  sftp: "Secure file transfer (SFTP)",
  csv: "CSV import",
  manual: "Manual import",
};

// Data domains and their default owning label when SchoolHub is native.
export const DATA_DOMAINS = [
  "identity",
  "attendance",
  "homework",
  "rewards",
  "calendar",
  "docs",
  "gps",
  "maps",
  "journey",
] as const;
export type DataDomain = (typeof DATA_DOMAINS)[number];

export const DOMAIN_LABELS: Record<string, string> = {
  identity: "Student & parent identity",
  attendance: "Attendance",
  homework: "Homework",
  rewards: "Rewards & behaviour",
  calendar: "Calendar & events",
  docs: "Documents",
  gps: "Live GPS",
  maps: "Mapping / routing",
  journey: "Journey status",
};

export type FieldMap = { domain: string; externalField: string; internalField: string; direction?: string };

export type Connector = {
  key: string;
  name: string;
  category: "mis" | "identity" | "calendar" | "docs" | "maps" | "gps" | "email" | "behaviour";
  description: string;
  methods: IntegrationMethod[];
  domains: string[]; // data domains this connector can own
  sourceLabel: string; // how it appears in the source-of-truth registry
  defaultMappings: FieldMap[];
};

const idMap = (ext: Record<string, string>): FieldMap[] =>
  Object.entries(ext).map(([externalField, internalField]) => ({ domain: "identity", externalField, internalField, direction: "in" }));

export const CONNECTOR_CATALOG: Connector[] = [
  {
    key: "isams",
    name: "iSAMS",
    category: "mis",
    description: "Independent-school MIS. Student identity and attendance.",
    methods: ["rest", "scheduled", "csv", "manual"],
    domains: ["identity", "attendance"],
    sourceLabel: "School MIS",
    defaultMappings: idMap({ SchoolId: "student.reference", Forename: "student.firstName", Surname: "student.lastName", DOB: "student.dateOfBirth", Form: "student.class", NCYear: "student.yearGroup" }),
  },
  {
    key: "arbor",
    name: "Arbor",
    category: "mis",
    description: "Cloud MIS. Student identity, guardians and attendance.",
    methods: ["rest", "scheduled", "csv", "manual"],
    domains: ["identity", "attendance"],
    sourceLabel: "School MIS",
    defaultMappings: idMap({ "student.id": "student.reference", "student.first_name": "student.firstName", "student.last_name": "student.lastName", "student.date_of_birth": "student.dateOfBirth", "registration_form": "student.class", "guardian.email": "guardian.email" }),
  },
  {
    key: "bromcom",
    name: "Bromcom",
    category: "mis",
    description: "MIS for state schools and trusts. Identity and attendance.",
    methods: ["rest", "scheduled", "csv", "manual"],
    domains: ["identity", "attendance"],
    sourceLabel: "School MIS",
    defaultMappings: idMap({ AdmissionNumber: "student.reference", LegalForename: "student.firstName", LegalSurname: "student.lastName", DateOfBirth: "student.dateOfBirth", TutorGroup: "student.class", YearGroup: "student.yearGroup" }),
  },
  {
    key: "sims",
    name: "SIMS",
    category: "mis",
    description: "ESS SIMS. Typically file-based (CTF/ATF) or scheduled export.",
    methods: ["sftp", "scheduled", "csv", "manual"],
    domains: ["identity", "attendance"],
    sourceLabel: "School MIS",
    defaultMappings: idMap({ UPN: "student.reference", Forename: "student.firstName", Surname: "student.lastName", DOB: "student.dateOfBirth", RegGroup: "student.class", Year: "student.yearGroup" }),
  },
  {
    key: "google-workspace",
    name: "Google Workspace",
    category: "identity",
    description: "Directory / SSO. Staff and student accounts.",
    methods: ["rest", "scheduled"],
    domains: ["identity"],
    sourceLabel: "Google Workspace",
    defaultMappings: idMap({ primaryEmail: "user.email", "name.givenName": "user.firstName", "name.familyName": "user.lastName" }),
  },
  {
    key: "microsoft-365",
    name: "Microsoft 365",
    category: "identity",
    description: "Entra ID / SSO. Staff and student accounts.",
    methods: ["rest", "scheduled"],
    domains: ["identity"],
    sourceLabel: "Microsoft 365",
    defaultMappings: idMap({ userPrincipalName: "user.email", givenName: "user.firstName", surname: "user.lastName" }),
  },
  {
    key: "google-calendar",
    name: "Google Calendar",
    category: "calendar",
    description: "School and class calendars.",
    methods: ["rest", "scheduled"],
    domains: ["calendar"],
    sourceLabel: "Google Calendar",
    defaultMappings: [
      { domain: "calendar", externalField: "summary", internalField: "event.title", direction: "in" },
      { domain: "calendar", externalField: "start.dateTime", internalField: "event.startsAt", direction: "in" },
      { domain: "calendar", externalField: "location", internalField: "event.location", direction: "in" },
    ],
  },
  {
    key: "outlook-calendar",
    name: "Microsoft Outlook Calendar",
    category: "calendar",
    description: "School and class calendars via Microsoft Graph.",
    methods: ["rest", "scheduled"],
    domains: ["calendar"],
    sourceLabel: "Outlook Calendar",
    defaultMappings: [
      { domain: "calendar", externalField: "subject", internalField: "event.title", direction: "in" },
      { domain: "calendar", externalField: "start.dateTime", internalField: "event.startsAt", direction: "in" },
      { domain: "calendar", externalField: "location.displayName", internalField: "event.location", direction: "in" },
    ],
  },
  {
    key: "google-drive",
    name: "Google Drive",
    category: "docs",
    description: "Document repository for letters and policies.",
    methods: ["rest"],
    domains: ["docs"],
    sourceLabel: "Google Drive",
    defaultMappings: [
      { domain: "docs", externalField: "name", internalField: "document.title", direction: "in" },
      { domain: "docs", externalField: "webViewLink", internalField: "document.url", direction: "in" },
    ],
  },
  {
    key: "sharepoint",
    name: "SharePoint",
    category: "docs",
    description: "Microsoft document repository.",
    methods: ["rest"],
    domains: ["docs"],
    sourceLabel: "SharePoint",
    defaultMappings: [
      { domain: "docs", externalField: "Title", internalField: "document.title", direction: "in" },
      { domain: "docs", externalField: "ServerRelativeUrl", internalField: "document.url", direction: "in" },
    ],
  },
  {
    key: "google-maps",
    name: "Google Maps",
    category: "maps",
    description: "Geocoding and routing for transport.",
    methods: ["rest"],
    domains: ["maps"],
    sourceLabel: "Google Maps",
    defaultMappings: [
      { domain: "maps", externalField: "geometry.location", internalField: "stop.coordinates", direction: "in" },
    ],
  },
  {
    key: "gps-provider",
    name: "GPS tracking provider",
    category: "gps",
    description: "Live vehicle GPS positions (push or poll).",
    methods: ["rest", "webhook"],
    domains: ["gps"],
    sourceLabel: "Tracking provider",
    defaultMappings: [
      { domain: "gps", externalField: "vehicle_id", internalField: "vehicle.reference", direction: "in" },
      { domain: "gps", externalField: "lat", internalField: "position.lat", direction: "in" },
      { domain: "gps", externalField: "lng", internalField: "position.lng", direction: "in" },
      { domain: "gps", externalField: "timestamp", internalField: "position.at", direction: "in" },
    ],
  },
  {
    key: "email-provider",
    name: "Email provider",
    category: "email",
    description: "Transactional email delivery (notifications).",
    methods: ["rest"],
    domains: [],
    sourceLabel: "Email provider",
    defaultMappings: [],
  },
  {
    key: "behaviour-system",
    name: "Behaviour & rewards system",
    category: "behaviour",
    description: "Rewards, points and behaviour events.",
    methods: ["rest", "webhook", "scheduled"],
    domains: ["rewards"],
    sourceLabel: "Behaviour system",
    defaultMappings: [
      { domain: "rewards", externalField: "RewardType", internalField: "reward.category", direction: "in" },
      { domain: "rewards", externalField: "Points", internalField: "reward.points", direction: "in" },
      { domain: "rewards", externalField: "PupilRef", internalField: "student.reference", direction: "in" },
    ],
  },
];

export function getConnector(key: string): Connector | undefined {
  return CONNECTOR_CATALOG.find((c) => c.key === key);
}
