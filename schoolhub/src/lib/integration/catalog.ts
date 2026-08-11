// Integration Hub connector catalog (framework layer).
//
// This EXTENDS the existing `CONNECTOR_CATALOG` (src/lib/connectors.ts) with the
// richer metadata the Hub marketplace + configuration wizard need, and adds the
// remaining templates from the spec. Existing code keeps using the base catalog;
// the Hub uses HUB_CATALOG. Provider-specific systems whose authorised API we
// have not integrated are shipped as *configurable shells* marked
// `Custom Configuration Required` — we never fabricate a provider's endpoints.

import { CONNECTOR_CATALOG, getConnector } from "../connectors";

export const CONNECTOR_CATEGORIES = [
  "mis", "rostering", "lms", "behaviour", "safeguarding", "attendance", "payment", "meals",
  "calendar", "email", "docs", "gps", "maps", "navigation", "identity",
  "communication", "storage", "custom",
] as const;
export type ConnectorCategory = (typeof CONNECTOR_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  mis: "School MIS / SIS", rostering: "Rostering / Interoperability", lms: "Learning Management System",
  behaviour: "Behaviour & Rewards", safeguarding: "Safeguarding", attendance: "Attendance",
  payment: "Payment Platform", meals: "School Meals",
  calendar: "Calendar", email: "Email", docs: "Document Repository", gps: "GPS & Telematics",
  maps: "Maps & Routing", navigation: "Navigation (deep-link)", identity: "Identity Provider",
  communication: "Communication Platform", storage: "File Storage", custom: "Custom Integration",
};

export const CONNECTION_TYPES = ["rest", "webhook", "sftp", "cloud_files", "file_upload", "oauth_api"] as const;
export const AUTH_METHODS = ["none", "api_key", "bearer", "basic", "oauth2", "client_credentials", "custom_header", "sftp_key", "signature"] as const;
export const OPERATIONS = ["read", "import", "export", "create", "update", "delete", "webhook", "write_back"] as const;
export type Operation = (typeof OPERATIONS)[number];
export const SYNC_FREQUENCIES = ["realtime", "15min", "hourly", "daily", "weekly", "custom", "manual"] as const;

export const CONNECTOR_STATUSES = ["available", "beta", "coming_soon", "custom", "unavailable"] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];
export const STATUS_LABELS: Record<ConnectorStatus, string> = {
  available: "Available", beta: "Beta", coming_soon: "Coming Soon",
  custom: "Custom Configuration Required", unavailable: "Unavailable",
};

export type ConfigField = { key: string; label: string; type: "text" | "url" | "secret" | "select" | "number" | "boolean"; required?: boolean; secret?: boolean; options?: string[]; help?: string };

export type ConnectorTemplate = {
  key: string;
  name: string;
  provider: string;
  category: ConnectorCategory;
  description: string;
  connectionType: (typeof CONNECTION_TYPES)[number];
  authMethod: (typeof AUTH_METHODS)[number];
  supportedObjects: string[];
  supportedOperations: Operation[];
  status: ConnectorStatus;
  setupComplexity: "low" | "medium" | "high";
  defaultFrequency: (typeof SYNC_FREQUENCIES)[number];
  requiresProviderCredentials: boolean;
  configFields: ConfigField[];
  docsUrl?: string;
  icon: string; // emoji placeholder; swap for provider logo asset
};

// Common config-field bundles.
const REST_FIELDS: ConfigField[] = [
  { key: "baseUrl", label: "Base URL", type: "url", required: true },
  { key: "apiKey", label: "API key", type: "secret", secret: true },
  { key: "scheduleCron", label: "Schedule (cron, optional)", type: "text" },
];
const OAUTH_FIELDS: ConfigField[] = [
  { key: "clientId", label: "Client ID", type: "text", required: true },
  { key: "clientSecret", label: "Client secret", type: "secret", secret: true, required: true },
  { key: "tenantOrDomain", label: "Tenant / domain", type: "text" },
];
const SFTP_FIELDS: ConfigField[] = [
  { key: "host", label: "Host", type: "text", required: true },
  { key: "port", label: "Port", type: "number" },
  { key: "username", label: "Username", type: "text", required: true },
  { key: "password", label: "Password", type: "secret", secret: true },
  { key: "path", label: "Remote path", type: "text", required: true },
];
const WEBHOOK_FIELDS: ConfigField[] = [
  { key: "signingSecret", label: "Signing secret", type: "secret", secret: true, help: "Used to verify inbound signatures (HMAC-SHA256)." },
];
const FILE_FIELDS: ConfigField[] = [
  { key: "fileFormat", label: "File format", type: "select", options: ["csv", "excel", "json", "xml"], required: true },
];

const misObjects = ["Student", "Parent", "Guardian", "Parent-student relationship", "Staff", "Class", "Year group", "Attendance"];

// Provider-specific templates that are configurable shells (no fabricated APIs).
function misShell(key: string, name: string, note: string): ConnectorTemplate {
  return {
    key, name, provider: name, category: "mis",
    description: `${name} school MIS. Configurable shell — ${note}`,
    connectionType: key === "sims" ? "sftp" : "rest",
    authMethod: key === "sims" ? "sftp_key" : "api_key",
    supportedObjects: misObjects,
    supportedOperations: ["read", "import"],
    status: "custom",
    setupComplexity: "high",
    defaultFrequency: "daily",
    requiresProviderCredentials: true,
    configFields: key === "sims" ? SFTP_FIELDS : REST_FIELDS,
    icon: "🏫",
  };
}

// Compact builder for provider-specific connector shells (sensible defaults;
// real credentials + field mapping are supplied per school before going live).
function mk(o: Partial<ConnectorTemplate> & { key: string; name: string; category: ConnectorCategory; icon: string }): ConnectorTemplate {
  const oauth = o.connectionType === "oauth_api" || o.authMethod === "oauth2";
  const webhook = (o.supportedOperations ?? []).includes("webhook");
  return {
    provider: o.provider ?? o.name,
    description: o.description ?? `${o.name} — configurable connector.`,
    connectionType: o.connectionType ?? "rest",
    authMethod: o.authMethod ?? "api_key",
    supportedObjects: o.supportedObjects ?? ["*"],
    supportedOperations: o.supportedOperations ?? ["read", "import"],
    status: o.status ?? "custom",
    setupComplexity: o.setupComplexity ?? "medium",
    defaultFrequency: o.defaultFrequency ?? "daily",
    requiresProviderCredentials: o.requiresProviderCredentials ?? true,
    configFields: o.configFields ?? (oauth ? OAUTH_FIELDS : webhook ? [...REST_FIELDS, ...WEBHOOK_FIELDS] : REST_FIELDS),
    ...o,
  } as ConnectorTemplate;
}

// Named connectors for the platforms schools most commonly use. Anything not
// listed is still integrable via the generic REST / webhook / file connectors
// at the bottom of this catalog, or by adding a shell like these.
const NAMED_CONNECTORS: ConnectorTemplate[] = [
  // Rostering / interoperability gateways (one integration → many MIS)
  mk({ key: "wonde", name: "Wonde", category: "rostering", icon: "🔗", description: "UK MIS gateway — one API to 30+ MIS (SIMS, Arbor, Bromcom, ScholarPack…).", supportedObjects: misObjects, defaultFrequency: "hourly" }),
  mk({ key: "groupcall-xporter", name: "Groupcall Xporter On Demand", category: "rostering", icon: "🔗", description: "UK MIS data-extraction gateway.", supportedObjects: misObjects, defaultFrequency: "hourly" }),
  mk({ key: "clever", name: "Clever", category: "rostering", icon: "🍎", description: "US rostering & SSO across many SIS.", connectionType: "oauth_api", authMethod: "oauth2", supportedObjects: misObjects }),
  mk({ key: "classlink", name: "ClassLink", category: "rostering", icon: "🔗", description: "US rostering & SSO (Roster Server).", connectionType: "oauth_api", authMethod: "oauth2", supportedObjects: misObjects }),
  mk({ key: "oneroster", name: "OneRoster (1EdTech)", category: "rostering", icon: "📐", description: "Open OneRoster REST/CSV standard.", authMethod: "oauth2", supportedObjects: misObjects, status: "beta" }),

  // More MIS / SIS (UK + US + international) — provider shells
  mk({ key: "scholarpack", name: "ScholarPack", category: "mis", icon: "🏫", supportedObjects: misObjects, setupComplexity: "high" }),
  mk({ key: "rm-integris", name: "RM Integris", category: "mis", icon: "🏫", supportedObjects: misObjects, setupComplexity: "high" }),
  mk({ key: "advanced-progresso", name: "Progresso (Advanced)", category: "mis", icon: "🏫", supportedObjects: misObjects, setupComplexity: "high" }),
  mk({ key: "pupil-asset", name: "Pupil Asset", category: "mis", icon: "🏫", supportedObjects: misObjects, setupComplexity: "high" }),
  mk({ key: "engage-mis", name: "Engage (Double First)", category: "mis", icon: "🏫", supportedObjects: misObjects, setupComplexity: "high" }),
  mk({ key: "wcbs-pass", name: "WCBS PASS / 3sys", category: "mis", icon: "🏫", supportedObjects: misObjects, setupComplexity: "high" }),
  mk({ key: "powerschool", name: "PowerSchool SIS", category: "mis", icon: "🏫", supportedObjects: misObjects, setupComplexity: "high" }),
  mk({ key: "infinite-campus", name: "Infinite Campus", category: "mis", icon: "🏫", supportedObjects: misObjects, setupComplexity: "high" }),
  mk({ key: "skyward", name: "Skyward", category: "mis", icon: "🏫", supportedObjects: misObjects, setupComplexity: "high" }),
  mk({ key: "aeries", name: "Aeries SIS", category: "mis", icon: "🏫", supportedObjects: misObjects, setupComplexity: "high" }),
  mk({ key: "synergy", name: "Synergy (Edupoint)", category: "mis", icon: "🏫", supportedObjects: misObjects, setupComplexity: "high" }),
  mk({ key: "blackbaud", name: "Blackbaud Education Management", category: "mis", icon: "🏫", supportedObjects: misObjects, setupComplexity: "high" }),
  mk({ key: "facts-sis", name: "FACTS SIS (RenWeb)", category: "mis", icon: "🏫", supportedObjects: misObjects, setupComplexity: "high" }),
  mk({ key: "gibbon", name: "Gibbon (open source)", category: "mis", icon: "🏫", supportedObjects: misObjects, status: "beta" }),

  // Behaviour & rewards
  mk({ key: "classcharts", name: "ClassCharts (Tes)", category: "behaviour", icon: "⭐", supportedObjects: ["Behaviour record", "Reward record", "Detention"], supportedOperations: ["read", "import", "webhook"], defaultFrequency: "realtime" }),
  mk({ key: "classdojo", name: "ClassDojo", category: "behaviour", icon: "🐵", supportedObjects: ["Behaviour record", "Reward record"], supportedOperations: ["read", "import"] }),
  mk({ key: "sleuth", name: "Sleuth", category: "behaviour", icon: "🔎", supportedObjects: ["Behaviour record", "Incident"], supportedOperations: ["read", "import"] }),

  // Safeguarding
  mk({ key: "cpoms", name: "CPOMS", category: "safeguarding", icon: "🛡️", description: "Safeguarding & child-protection records (restricted; DSL-only visibility).", supportedObjects: ["Safeguarding concern"], supportedOperations: ["read", "import"], setupComplexity: "high" }),
  mk({ key: "myconcern", name: "MyConcern (One Team Logic)", category: "safeguarding", icon: "🛡️", supportedObjects: ["Safeguarding concern"], supportedOperations: ["read", "import"], setupComplexity: "high" }),
  mk({ key: "tootoot", name: "tootoot", category: "safeguarding", icon: "🛡️", supportedObjects: ["Safeguarding report"], supportedOperations: ["read", "import"] }),

  // Payments
  mk({ key: "parentpay", name: "ParentPay", category: "payment", icon: "💳", supportedObjects: ["Payment status", "Trip payment", "Meal balance"], supportedOperations: ["read", "import", "webhook"], defaultFrequency: "realtime" }),
  mk({ key: "scopay", name: "SCOPAY (Tucasi)", category: "payment", icon: "💳", supportedObjects: ["Payment status", "Meal balance"], supportedOperations: ["read", "import"] }),
  mk({ key: "wisepay", name: "WisePay", category: "payment", icon: "💳", supportedObjects: ["Payment status"], supportedOperations: ["read", "import"] }),
  mk({ key: "ipayimpact", name: "iPayimpact", category: "payment", icon: "💳", supportedObjects: ["Payment status"], supportedOperations: ["read", "import"] }),

  // School meals / catering
  mk({ key: "cypad", name: "Cypad", category: "meals", icon: "🍽️", supportedObjects: ["Menu", "Meal choice", "Balance"], supportedOperations: ["read", "import"] }),
  mk({ key: "dolce", name: "Dolce", category: "meals", icon: "🍽️", supportedObjects: ["Menu", "Meal choice"], supportedOperations: ["read", "import"] }),
  mk({ key: "cunninghams", name: "Cunninghams (Fusion)", category: "meals", icon: "🍽️", supportedObjects: ["Menu", "Meal choice", "Balance"], supportedOperations: ["read", "import"] }),

  // Learning platforms / VLE
  mk({ key: "google-classroom", name: "Google Classroom", category: "lms", icon: "📚", connectionType: "oauth_api", authMethod: "oauth2", supportedObjects: ["Class", "Assignment", "Homework summary"], supportedOperations: ["read", "import"], status: "beta" }),
  mk({ key: "ms-teams-education", name: "Microsoft Teams for Education", category: "lms", icon: "📚", connectionType: "oauth_api", authMethod: "oauth2", supportedObjects: ["Class", "Assignment"], supportedOperations: ["read", "import"], status: "beta" }),
  mk({ key: "satchel-one", name: "Satchel One (Show My Homework)", category: "lms", icon: "📚", supportedObjects: ["Homework summary"], supportedOperations: ["read", "import"] }),
  mk({ key: "seesaw", name: "Seesaw", category: "lms", icon: "📚", supportedObjects: ["Assignment", "Journal"], supportedOperations: ["read", "import"] }),
  mk({ key: "firefly", name: "Firefly", category: "lms", icon: "📚", supportedObjects: ["Homework summary", "Task"], supportedOperations: ["read", "import"] }),
  mk({ key: "canvas", name: "Canvas (Instructure)", category: "lms", icon: "📚", authMethod: "oauth2", supportedObjects: ["Course", "Assignment"], supportedOperations: ["read", "import"] }),
  mk({ key: "moodle", name: "Moodle", category: "lms", icon: "📚", supportedObjects: ["Course", "Assignment"], supportedOperations: ["read", "import"] }),

  // Parent communication platforms
  mk({ key: "parentmail", name: "ParentMail", category: "communication", icon: "✉️", supportedObjects: ["Message", "Form", "Payment"], supportedOperations: ["read", "import"] }),
  mk({ key: "weduc", name: "Weduc (Eduspot)", category: "communication", icon: "✉️", supportedObjects: ["Message", "Newsletter"], supportedOperations: ["read", "import"] }),
  mk({ key: "groupcall-messenger", name: "Groupcall Messenger", category: "communication", icon: "✉️", supportedObjects: ["Message"], supportedOperations: ["read", "import", "export"] }),
  mk({ key: "twilio", name: "Twilio (SMS)", category: "communication", icon: "📶", authMethod: "basic", supportedObjects: ["SMS"], supportedOperations: ["export", "webhook"], defaultFrequency: "realtime" }),
  mk({ key: "whatsapp-cloud", name: "WhatsApp Business Cloud", category: "communication", icon: "💬", authMethod: "bearer", supportedObjects: ["WhatsApp message"], supportedOperations: ["export", "webhook"], defaultFrequency: "realtime" }),

  // GPS & telematics (vehicle / bus tracking)
  mk({ key: "samsara", name: "Samsara", category: "gps", icon: "📍", authMethod: "bearer", supportedObjects: ["GPS location", "Vehicle", "Journey status"], supportedOperations: ["read", "webhook"], defaultFrequency: "realtime" }),
  mk({ key: "geotab", name: "Geotab", category: "gps", icon: "📍", supportedObjects: ["GPS location", "Vehicle"], supportedOperations: ["read", "webhook"], defaultFrequency: "realtime" }),
  mk({ key: "verizon-connect", name: "Verizon Connect", category: "gps", icon: "📍", supportedObjects: ["GPS location", "Vehicle"], supportedOperations: ["read", "webhook"], defaultFrequency: "realtime" }),
  mk({ key: "teletrac-navman", name: "Teletrac Navman", category: "gps", icon: "📍", supportedObjects: ["GPS location", "Vehicle"], supportedOperations: ["read", "webhook"], defaultFrequency: "realtime" }),
  mk({ key: "zonar", name: "Zonar Systems", category: "gps", icon: "🚌", description: "US school-bus GPS & telematics.", supportedObjects: ["GPS location", "Vehicle", "Student ridership"], supportedOperations: ["read", "webhook"], defaultFrequency: "realtime" }),
  mk({ key: "quartix", name: "Quartix", category: "gps", icon: "📍", supportedObjects: ["GPS location", "Vehicle"], supportedOperations: ["read", "webhook"], defaultFrequency: "realtime" }),
  mk({ key: "traccar", name: "Traccar (open source)", category: "gps", icon: "📍", description: "Self-hosted GPS server; works with many trackers.", supportedObjects: ["GPS location", "Vehicle"], supportedOperations: ["read", "webhook"], status: "beta", defaultFrequency: "realtime" }),
  mk({ key: "driver-phone-gps", name: "Driver phone GPS (built-in)", provider: "SIPlat", category: "gps", icon: "📱", description: "Live position straight from the driver app — no external provider needed.", connectionType: "webhook", authMethod: "signature", supportedObjects: ["GPS location", "Journey status"], supportedOperations: ["read", "webhook"], status: "available", requiresProviderCredentials: false, defaultFrequency: "realtime" }),

  // Maps & routing (ETA, geocoding)
  mk({ key: "mapbox", name: "Mapbox", category: "maps", icon: "🗺️", supportedObjects: ["Transport route", "ETA"], supportedOperations: ["read"], setupComplexity: "low" }),
  mk({ key: "here", name: "HERE", category: "maps", icon: "🗺️", supportedObjects: ["Transport route", "ETA"], supportedOperations: ["read"], setupComplexity: "low" }),
  mk({ key: "tomtom", name: "TomTom", category: "maps", icon: "🗺️", supportedObjects: ["Transport route", "ETA"], supportedOperations: ["read"], setupComplexity: "low" }),

  // Navigation deep-links (open the driver's map app for turn-by-turn — these do
  // NOT pull a user's live location; live tracking uses GPS/telematics above)
  mk({ key: "waze-navigation", name: "Waze (navigation deep-link)", provider: "Waze", category: "navigation", icon: "🧭", description: "Open Waze for turn-by-turn to a stop/venue. Note: Waze has no public live-tracking API — live bus tracking uses driver GPS or a telematics provider.", connectionType: "rest", authMethod: "none", supportedObjects: ["Navigation link"], supportedOperations: ["read"], status: "available", requiresProviderCredentials: false, configFields: [] }),
  mk({ key: "google-maps-navigation", name: "Google Maps (navigation deep-link)", provider: "Google", category: "navigation", icon: "🧭", description: "Open Google Maps for turn-by-turn navigation.", connectionType: "rest", authMethod: "none", supportedObjects: ["Navigation link"], supportedOperations: ["read"], status: "available", requiresProviderCredentials: false, configFields: [] }),
  mk({ key: "apple-maps-navigation", name: "Apple Maps (navigation deep-link)", provider: "Apple", category: "navigation", icon: "🧭", description: "Open Apple Maps for turn-by-turn navigation.", connectionType: "rest", authMethod: "none", supportedObjects: ["Navigation link"], supportedOperations: ["read"], status: "available", requiresProviderCredentials: false, configFields: [] }),
];

export const HUB_CATALOG: ConnectorTemplate[] = [
  ...NAMED_CONNECTORS,
  // --- School MIS / SIS (provider shells) ---
  misShell("isams", "iSAMS", "supply your iSAMS Batch/REST API key and map fields."),
  misShell("arbor", "Arbor", "supply your Arbor REST credentials and map fields."),
  misShell("bromcom", "Bromcom", "supply your Bromcom API credentials and map fields."),
  misShell("sims", "SIMS", "typically CTF/ATF over SFTP or a scheduled export."),
  misShell("veracross", "Veracross", "supply your Veracross API credentials and map fields."),

  // --- Identity / productivity (OAuth shells, beta) ---
  { key: "google-workspace", name: "Google Workspace", provider: "Google", category: "identity", description: "Directory / SSO for staff and student accounts.", connectionType: "oauth_api", authMethod: "oauth2", supportedObjects: ["Staff", "Student", "Class"], supportedOperations: ["read", "import"], status: "beta", setupComplexity: "medium", defaultFrequency: "daily", requiresProviderCredentials: true, configFields: OAUTH_FIELDS, icon: "🟦" },
  { key: "microsoft-365", name: "Microsoft 365", provider: "Microsoft", category: "identity", description: "Entra ID / SSO for staff and student accounts.", connectionType: "oauth_api", authMethod: "oauth2", supportedObjects: ["Staff", "Student", "Class"], supportedOperations: ["read", "import"], status: "beta", setupComplexity: "medium", defaultFrequency: "daily", requiresProviderCredentials: true, configFields: OAUTH_FIELDS, icon: "🟧" },

  // --- Calendars (beta) ---
  { key: "google-calendar", name: "Google Calendar", provider: "Google", category: "calendar", description: "Import school/class events and term dates; export child events.", connectionType: "oauth_api", authMethod: "oauth2", supportedObjects: ["Calendar event", "Activity"], supportedOperations: ["read", "import", "export"], status: "beta", setupComplexity: "medium", defaultFrequency: "hourly", requiresProviderCredentials: true, configFields: OAUTH_FIELDS, icon: "📅" },
  { key: "outlook-calendar", name: "Microsoft Outlook Calendar", provider: "Microsoft", category: "calendar", description: "Calendars via Microsoft Graph.", connectionType: "oauth_api", authMethod: "oauth2", supportedObjects: ["Calendar event", "Activity"], supportedOperations: ["read", "import", "export"], status: "beta", setupComplexity: "medium", defaultFrequency: "hourly", requiresProviderCredentials: true, configFields: OAUTH_FIELDS, icon: "📆" },
  { key: "ics-feed", name: "ICS calendar feed", provider: "Generic", category: "calendar", description: "Subscribe to a public/authenticated ICS URL.", connectionType: "rest", authMethod: "none", supportedObjects: ["Calendar event"], supportedOperations: ["read", "import"], status: "available", setupComplexity: "low", defaultFrequency: "daily", requiresProviderCredentials: false, configFields: [{ key: "baseUrl", label: "ICS URL", type: "url", required: true }], icon: "🗓️" },

  // --- Document repositories / storage ---
  { key: "google-drive", name: "Google Drive", provider: "Google", category: "docs", description: "Document repository for letters and policies.", connectionType: "oauth_api", authMethod: "oauth2", supportedObjects: ["Document", "Newsletter"], supportedOperations: ["read", "import"], status: "beta", setupComplexity: "medium", defaultFrequency: "daily", requiresProviderCredentials: true, configFields: OAUTH_FIELDS, icon: "📁" },
  { key: "sharepoint", name: "Microsoft SharePoint", provider: "Microsoft", category: "docs", description: "Microsoft document repository.", connectionType: "oauth_api", authMethod: "oauth2", supportedObjects: ["Document", "Newsletter"], supportedOperations: ["read", "import"], status: "beta", setupComplexity: "medium", defaultFrequency: "daily", requiresProviderCredentials: true, configFields: OAUTH_FIELDS, icon: "📂" },
  { key: "onedrive", name: "Microsoft OneDrive", provider: "Microsoft", category: "docs", description: "Microsoft file storage.", connectionType: "oauth_api", authMethod: "oauth2", supportedObjects: ["Document"], supportedOperations: ["read", "import"], status: "beta", setupComplexity: "medium", defaultFrequency: "daily", requiresProviderCredentials: true, configFields: OAUTH_FIELDS, icon: "☁️" },
  { key: "sftp", name: "SFTP", provider: "Generic", category: "storage", description: "Scheduled or manual secure file pickup.", connectionType: "sftp", authMethod: "sftp_key", supportedObjects: ["Student", "Parent", "Staff", "Attendance"], supportedOperations: ["read", "import"], status: "available", setupComplexity: "medium", defaultFrequency: "daily", requiresProviderCredentials: true, configFields: [...SFTP_FIELDS, ...FILE_FIELDS], icon: "🔐" },
  { key: "amazon-s3", name: "Amazon S3", provider: "AWS", category: "storage", description: "Object storage file pickup.", connectionType: "cloud_files", authMethod: "api_key", supportedObjects: ["Document", "Student"], supportedOperations: ["read", "import"], status: "custom", setupComplexity: "medium", defaultFrequency: "daily", requiresProviderCredentials: true, configFields: [{ key: "bucket", label: "Bucket", type: "text", required: true }, { key: "region", label: "Region", type: "text", required: true }, { key: "accessKeyId", label: "Access key ID", type: "text", required: true }, { key: "secretAccessKey", label: "Secret access key", type: "secret", secret: true, required: true }, ...FILE_FIELDS], icon: "🪣" },
  { key: "azure-blob", name: "Azure Blob Storage", provider: "Microsoft", category: "storage", description: "Azure object storage file pickup.", connectionType: "cloud_files", authMethod: "api_key", supportedObjects: ["Document", "Student"], supportedOperations: ["read", "import"], status: "custom", setupComplexity: "medium", defaultFrequency: "daily", requiresProviderCredentials: true, configFields: [{ key: "container", label: "Container", type: "text", required: true }, { key: "connectionString", label: "Connection string", type: "secret", secret: true, required: true }, ...FILE_FIELDS], icon: "🔷" },

  // --- Payment / meals / GPS / maps / behaviour / LMS ---
  { key: "stripe", name: "Stripe", provider: "Stripe", category: "payment", description: "Payment status for trips and meals.", connectionType: "rest", authMethod: "bearer", supportedObjects: ["Payment status"], supportedOperations: ["read", "import", "webhook"], status: "custom", setupComplexity: "medium", defaultFrequency: "realtime", requiresProviderCredentials: true, configFields: [{ key: "secretKey", label: "Secret key", type: "secret", secret: true, required: true }, ...WEBHOOK_FIELDS], icon: "💳" },
  { key: "google-maps", name: "Google Maps Platform", provider: "Google", category: "maps", description: "Geocoding and routing for transport.", connectionType: "rest", authMethod: "api_key", supportedObjects: ["Transport route"], supportedOperations: ["read"], status: "custom", setupComplexity: "low", defaultFrequency: "manual", requiresProviderCredentials: true, configFields: [{ key: "apiKey", label: "API key", type: "secret", secret: true, required: true }], icon: "🗺️" },
  { key: "gps-provider", name: "GPS tracking provider", provider: "Generic", category: "gps", description: "Live vehicle GPS positions (push or poll).", connectionType: "webhook", authMethod: "signature", supportedObjects: ["GPS location", "Vehicle", "Journey status"], supportedOperations: ["read", "webhook"], status: "custom", setupComplexity: "medium", defaultFrequency: "realtime", requiresProviderCredentials: true, configFields: [...REST_FIELDS, ...WEBHOOK_FIELDS], icon: "📍" },
  { key: "behaviour-system", name: "Behaviour & rewards system", provider: "Generic", category: "behaviour", description: "Rewards, points and behaviour events.", connectionType: "rest", authMethod: "api_key", supportedObjects: ["Behaviour record", "Reward record", "Detention"], supportedOperations: ["read", "import", "webhook"], status: "custom", setupComplexity: "medium", defaultFrequency: "hourly", requiresProviderCredentials: true, configFields: [...REST_FIELDS, ...WEBHOOK_FIELDS], icon: "⭐" },
  { key: "lms", name: "Learning Management System", provider: "Generic", category: "lms", description: "Homework summaries and class assignments.", connectionType: "rest", authMethod: "oauth2", supportedObjects: ["Homework summary", "Class"], supportedOperations: ["read", "import"], status: "custom", setupComplexity: "medium", defaultFrequency: "hourly", requiresProviderCredentials: true, configFields: OAUTH_FIELDS, icon: "📚" },

  // --- Email (approved shared mailboxes only; never personal inboxes) ---
  { key: "email-provider", name: "Shared mailbox (Microsoft/Google/IMAP)", provider: "Generic", category: "email", description: "Import newsletters & approved communications from selected shared mailboxes and folders. Personal/unrestricted mailboxes are excluded by default.", connectionType: "oauth_api", authMethod: "oauth2", supportedObjects: ["Newsletter", "Email communication", "Document"], supportedOperations: ["read", "import"], status: "custom", setupComplexity: "high", defaultFrequency: "hourly", requiresProviderCredentials: true, configFields: [...OAUTH_FIELDS, { key: "mailboxes", label: "Allowed mailboxes (comma-separated)", type: "text", required: true }, { key: "folders", label: "Allowed folders", type: "text" }], icon: "✉️" },

  // --- Generic / manual (available now) ---
  { key: "generic-rest", name: "Generic REST API", provider: "Generic", category: "custom", description: "Connect any REST endpoint with configurable auth + mapping.", connectionType: "rest", authMethod: "api_key", supportedObjects: ["*"], supportedOperations: ["read", "import", "export", "create", "update"], status: "available", setupComplexity: "medium", defaultFrequency: "hourly", requiresProviderCredentials: true, configFields: [{ key: "baseUrl", label: "Base URL", type: "url", required: true }, { key: "authMethod", label: "Auth method", type: "select", options: ["api_key", "bearer", "basic", "oauth2", "custom_header"], required: true }, { key: "apiKey", label: "API key / token", type: "secret", secret: true }, { key: "scheduleCron", label: "Schedule (cron)", type: "text" }], icon: "🔌" },
  { key: "generic-webhook", name: "Generic webhook", provider: "Generic", category: "custom", description: "Receive signed inbound events; idempotent delivery log.", connectionType: "webhook", authMethod: "signature", supportedObjects: ["*"], supportedOperations: ["webhook", "import"], status: "available", setupComplexity: "low", defaultFrequency: "realtime", requiresProviderCredentials: false, configFields: WEBHOOK_FIELDS, icon: "🪝" },
  { key: "csv-import", name: "CSV import", provider: "SchoolHub", category: "custom", description: "Upload a CSV; preview, map, validate, import.", connectionType: "file_upload", authMethod: "none", supportedObjects: ["Student", "Parent", "Staff"], supportedOperations: ["import"], status: "available", setupComplexity: "low", defaultFrequency: "manual", requiresProviderCredentials: false, configFields: [], icon: "📄" },
  { key: "excel-import", name: "Excel import", provider: "SchoolHub", category: "custom", description: "Upload an .xlsx; preview, map, validate, import.", connectionType: "file_upload", authMethod: "none", supportedObjects: ["Student", "Parent", "Staff"], supportedOperations: ["import"], status: "available", setupComplexity: "low", defaultFrequency: "manual", requiresProviderCredentials: false, configFields: [], icon: "📊" },
  { key: "json-import", name: "JSON import", provider: "SchoolHub", category: "custom", description: "Upload a JSON array; map, validate, import.", connectionType: "file_upload", authMethod: "none", supportedObjects: ["*"], supportedOperations: ["import"], status: "available", setupComplexity: "low", defaultFrequency: "manual", requiresProviderCredentials: false, configFields: [], icon: "🧾" },
  { key: "xml-import", name: "XML import", provider: "SchoolHub", category: "custom", description: "Upload XML (e.g. CTF); map, validate, import.", connectionType: "file_upload", authMethod: "none", supportedObjects: ["Student"], supportedOperations: ["import"], status: "beta", setupComplexity: "medium", defaultFrequency: "manual", requiresProviderCredentials: false, configFields: [], icon: "📑" },
];

export function getTemplate(key: string): ConnectorTemplate | undefined {
  return HUB_CATALOG.find((c) => c.key === key);
}

/** Default field mappings, if the base catalog defines them for this key. */
export function defaultMappingsFor(key: string) {
  return getConnector(key)?.defaultMappings ?? [];
}

/** Marketplace view: search + filter. */
export function searchCatalog(opts: { q?: string; category?: string; status?: string } = {}): ConnectorTemplate[] {
  const q = (opts.q || "").trim().toLowerCase();
  return HUB_CATALOG.filter((c) => {
    if (opts.category && c.category !== opts.category) return false;
    if (opts.status && c.status !== opts.status) return false;
    if (q && !(`${c.name} ${c.provider} ${c.description}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

// Sanity: every base connector key is represented in the hub catalog.
export const BASE_KEYS_COVERED = CONNECTOR_CATALOG.every((c) => HUB_CATALOG.some((h) => h.key === c.key));
