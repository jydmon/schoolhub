# CRM, Campaigns, Website Capture, CMS Videos & Parent-Sub Tracking (Phase 17)

Additive slice. New Prisma models, pure logic (unit-tested), DB modules and API
routes. No existing tables changed except a `RouteDriver` back-relation on `Route`.

## What was added

### 1. CRM + email campaigns to audiences
- **Models:** `CrmContact`, `CrmSegment`, `Campaign`, `CampaignRecipient`.
- **Pure logic** (`src/lib/crm-logic.ts`, tested in `tests/crm.test.ts`): email
  normalise/validate, unsubscribe HMAC tokens, audience filter matching +
  role resolution, recipient de-duplication, campaign state machine + send
  eligibility, `{{merge}}` tag rendering, stat rollups.
- **DB** (`src/lib/crm.ts`): `captureContact`, `unsubscribeByToken`,
  `syncUsersToContacts`, `resolveRecipients` (CRM contacts **+** live platform
  users, de-duped, unsubscribes honoured), `audienceCounts`, `createCampaign`,
  `sendCampaign` (idempotent per campaign+email, fans out via the email stub),
  `sendTest`, `cancelCampaign`.
- **Audiences:** subscriber, parent, driver, tenant_admin, teacher,
  transport_manager, lead. Role-backed audiences also pull live users so a new
  parent is reachable before a contact row exists.
- **Routes** (platform-scoped by default; `?school=<id>` scopes to a tenant and
  requires `MANAGE_CRM`):
  - `GET/POST /api/crm/contacts`
  - `GET/POST /api/crm/audiences` (counts; POST syncs users→contacts)
  - `GET/POST /api/crm/campaigns`
  - `GET /api/crm/campaigns/[id]` (campaign + rollup stats)
  - `POST /api/crm/campaigns/[id]/action` (send | schedule | cancel | test)

### 2. Website "Subscribe now" → CRM
- `POST /api/public/subscribe` — no auth, per-IP rate-limited, always 200 (no
  account probing). Resolves `schoolSlug` → schoolId, creates a `subscriber`
  contact with consent.
- `GET /api/public/unsubscribe?e=&t=` — one-click unsubscribe (signed token).
- The marketing site's **Subscribe now** form posts here.

### 3. Transport: one or more drivers per route
- **Model:** `RouteDriver` (primary | relief | secondary; session all | am | pm).
- **Pure logic** (`src/lib/route-drivers-logic.ts`): roster validation (≥1 driver,
  exactly one primary, no duplicate driver+session, no all/am|pm clash),
  `effectiveDriver(session)`, `primaryDriver`.
- **DB** (`src/lib/transport.ts`): `listRouteDrivers`, `setRouteDrivers`
  (validates, replaces roster in a transaction, mirrors the primary onto
  `Route.driverUserId` for journey creation).
- **Route:** `GET/PUT /api/schools/[id]/routes/[routeId]/drivers`
  (`MANAGE_TRANSPORT`).

### 4. Integration reference preview ("what a similar system shows")
- **Pure logic** (`src/lib/integration-preview.ts`): `similarIntegrations`
  (same category, connected, most-recent first), `buildPreview` (objects,
  operations, reference system, sample row; falls back to category defaults).
- **Route:** `GET /api/schools/[id]/integration-hub/preview?category=&exclude=`
  — draws a masked sample from the most recent `ExternalRecordLink` of a similar
  connected system.

### 5. Content management — how-to videos
- **Model:** `HelpVideo` (schoolId null = platform-wide; category, audience, url,
  transcript, published, views).
- **DB** (`src/lib/cms.ts`): `createVideo`, `setVideoPublished`, `removeVideo`,
  `listVideos` (a school sees its own + platform-wide, published-only unless
  admin), `recordVideoView`.
- **Routes:** `GET/POST /api/cms/videos`, `PATCH/DELETE /api/cms/videos/[id]`
  (`MANAGE_CONTENT`; PATCH `action:"view"` is public for the counter).
- Video bytes live in object storage in production; the row stores the URL/ref.

### 6. Parent subscriptions → super-admin tracking
- **Model:** `ParentSubscription` (Stripe refs only — no card data).
- **Pure logic** (`src/lib/parent-sub-logic.ts`): `summarize` (active/trialing/
  past-due/canceled, MRR/ARR/ARPU), `bySchool`, `monthlyMinor`.
- **DB** (`src/lib/parent-subscriptions.ts`): `upsertParentSubscription`,
  `platformParentSubSummary` (with per-school names), `schoolParentSubSummary`.
- **Route:** `GET/POST /api/platform/parent-subscriptions` (platform admin).

## Permissions / audit
- New permissions `MANAGE_CRM`, `MANAGE_CONTENT` — granted to Platform Super
  Admin and School Administrator.
- New audit keys: CONTACT_CAPTURED/UNSUBSCRIBED/IMPORTED, CAMPAIGN_CREATED/
  SCHEDULED/SENT/CANCELLED, ROUTE_DRIVERS_SET, VIDEO_CREATED/PUBLISHED/REMOVED,
  PARENT_SUB_CHANGED.

## Migration
`prisma/migrations/20260807160000_crm_cms_parentsub/migration.sql` — additive
(7 new tables + indexes). Apply with `prisma migrate deploy`.

## Env
- `CRM_SECRET` (optional) — HMAC key for unsubscribe tokens; falls back to
  `JWT_SECRET`.

## Tests
`tests/crm.test.ts` — 20 pure-logic tests (email, tokens, audiences, de-dup,
state machine, merge tags, stats, preview, roster rules, parent-sub maths).
All 60 unit tests across the project pass (`tsx tests/*.test.ts`).

---

# Phase 17b — Templates, Usage Analytics, SIPlat Staff RBAC, Subscription Approvals

Additive follow-up slice.

## Added
1. **CRM multi-audience + duplicate + preview**
   - Campaigns already accept an **array** of audiences (`audienceFilterSchema.audiences`); `resolveRecipients` unions them and de-dupes by email.
   - `duplicateCampaign` (crm.ts) + campaign action `duplicate`.
   - `POST /api/crm/preview` renders subject/body with merge tags for the composer preview panel.
2. **Template library** — `MessageTemplate` model (kind: email_campaign | message_board | email_notification; scope platform|tenant; `sharedWithTenants`). `templates.ts` + routes:
   - `GET/POST /api/platform/templates`, `PATCH/DELETE /api/platform/templates/[id]`
   - `GET/POST /api/schools/[id]/templates` (own + platform templates shared with tenants)
3. **Usage analytics** — `UsageEvent` model + `usage-logic.ts` (pure: per-user login counts, first/last login, active days, functions carried out, volume; role cohorts) + `usage.ts` + `GET /api/platform/usage?view=users|roles|system`. `recordUsage()` is called on login and key actions.
4. **Subscription reporting + manual approval** — approval fields on `Subscription` and `ParentSubscription` (`approvalMode`, `approvalStatus`, `approvedByUserId`, `approvedAt`, `reminderSentAt`); `subscription-approval-logic.ts` (pure: days-until-renewal, reminder cadence 30/14/7/1 + overdue, auto-vs-manual renewal, portfolio report) + `subscriptions-admin.ts` + `GET/POST /api/platform/subscriptions` (report + set_mode/approve/reject).
5. **SIPlat staff RBAC (super-admin only)** — `PlatformRole` + `PlatformStaff` models; `platform-staff-logic.ts` (areas, `canAccessArea`, `visibleAreas`, role catalog owner/billing/support/sales/analyst/content) + `platform-staff.ts` + routes `GET/POST /api/platform/staff`, `PATCH /api/platform/staff/[id]`, `GET /api/platform/staff/roles`. All platform routes are gated by `assertStaffArea(...)` so a staff member only reaches areas their role grants.

## Migration
`prisma/migrations/20260810120000_templates_usage_staff/migration.sql` — additive (5 columns × 2 subscription tables + 4 new tables + indexes).

## Tests
`tests/phase17b.test.ts` — 13 pure-logic tests. **73 unit tests pass across the project.**

---

# Phase 17c — PII protection, Policies, Announcements, Event tracking, Email config, Support chat, Reports

Additive slice + demo updates. 18 new pure-logic tests (91 total).

## Added
1. **PII encryption + troubleshoot masking** — `pii.ts` (AES-256-GCM under a dedicated `PII_ENC_KEY`) + `pii-logic.ts` (maskName/maskField, `canSeePII`, `viewPupil`). Pupil PII is masked for platform (SIPlat) staff — including in troubleshooting — unless the tenant admin issues a time-boxed, audited `PiiUnmaskGrant`. Passwords remain bcrypt-hashed (`auth.ts`). Routes: `GET/POST /api/schools/[id]/pii-grants`.
2. **Policies** — `Policy` model (audience all/parents/teachers/staff, category, version, requireAck, upload or authored body) + `policies.ts`. Routes: `/api/schools/[id]/policies` (+ `?viewer=parents|teachers`), `/api/platform/policies`.
3. **Announcements** — `Announcement` model + `announce-logic.ts` (audience all/year/class/list; channel gating: in-app always, email needs address, SMS opt-out, WhatsApp opt-in) + `announcements.ts`. Routes: `/api/schools/[id]/announcements` (+ `/[aid]/send`).
4. **Event/trip real-time updates** — `EventUpdate` model + `Trip.updateConfigJson` + `event-updates-logic.ts` (standard buttons: journey_started/traffic/delayed/arrived/event_completed/heading_back/back_at_school + add/remove custom) + `event-updates.ts`. Notifies parents of pupils on the trip; rolls up into tenant + platform reports. Routes: `/api/schools/[id]/events/updates`, `/events/config`.
5. **Email configuration** — `EmailConfig` (secret encrypted, never returned) + `platform-ops.ts`. Route: `GET/PUT /api/platform/email-config`.
6. **Support chat** — `SupportChat` + `SupportChatMessage` + `platform-ops.ts`. Routes: `/api/platform/support-chats` (+ `/[cid]/messages`).
7. **Reports** — `ReportRun` + `report-builder-logic.ts` (usage/subscription/engagement/event_tracking/adoption/parent_child; sections, totals, CSV). Route: `GET/POST /api/platform/reports`.

## Demo
- Super admin: Schools directory + detail (tenant admin, profile, performance→analytics, subscription history); Reports generator; Policies create/upload with metadata; Team & access bulk actions + CSV export; Email configuration; Help desk live chat; Troubleshooting PII masking + unmask request.
- Tenant admin: AI Assistant; Announcements (all/some parents × in-app/email/WhatsApp/SMS); Event tracking (notification buttons, add/remove, live timeline); Integration Hub "what data each connection makes available → shown to parents".
- Parent: AI Assistant moved to top (web + mobile); add personal calendar entries; School reports (term/year + rewards/consequences); My reports (generate from connected systems).

## Migration
`prisma/migrations/20260810140000_pii_policies_announce_events` — additive (1 column on Trip + 8 new tables + indexes).

## Env
- `PII_ENC_KEY` (prod) — dedicated 32-byte key for pupil-PII field encryption; falls back to a JWT_SECRET-derived key in dev (flagged insecure).

## Tests
`tests/phase17c.test.ts` — 18 pure-logic tests. **91 unit tests pass across the project.**

---

# Phase 17d — Announcements on real adapters + Policy acknowledgement tracking

## 1. Announcements wired to the real SMS/WhatsApp/email adapters
`sendAnnouncement` (announcements.ts) now fans out through the SAME delivery
engine as the notification centre — `notify.deliver()` — instead of an in-app-
only stub:
- **in-app** → a `Notification` row per recipient;
- **email** → `sendEmail` to the recipient's real address (the email branch of
  `deliver()` was updated to look up `User.email`);
- **SMS** → `sendSms`, skipped for `smsOptOut` parents (opt-out honoured);
- **WhatsApp** → `sendWhatsApp` with the approved `general_update` template,
  skipped unless `whatsappOptIn` (opt-in enforced).
Per-channel **sent/failed** is tallied and stored on the announcement
(`perChannelJson`, `reachedCount`), and a `Notification` delivery row is written
for every attempt. Providers are console-mode until `SMS_MODE`/`WHATSAPP_MODE`/
`EMAIL_MODE` + provider env vars are set — the interface is unchanged when they
go live. `deliver()` is now exported from notify.ts.

## 2. Policy acknowledgement tracking (parents & teachers)
- **Model:** `PolicyAck` — unique per `(policyId, userId, version)` so a version
  bump requires re-acknowledgement.
- **Pure logic** (`policy-ack-logic.ts`, tested): `policyAppliesTo` (audience),
  `hasAcknowledged` (version-specific), `needsAck` (respects requireAck / publish
  / audience / version), `annotateForViewer`, `ackStatus` (acknowledged / pending
  / pct / pendingUserIds).
- **DB** (`policy-acks.ts`): `acknowledgePolicy` (idempotent upsert at current
  version), `viewerPoliciesWithAck` (parent/teacher list annotated with ack
  state), `policyAckStatus` (admin rollup across the resolved audience).
- **Routes:** `POST /api/schools/[id]/policies/[pid]/ack` (parent/teacher),
  `GET /api/schools/[id]/policies/[pid]/ack-status` (admin). The viewer policies
  route (`?viewer=parents|teachers`) now returns ack-annotated policies.
- New audit key `POLICY_ACKNOWLEDGED`.

## Demo
- Announcement send now reports realistic per-channel delivery (in-app all;
  email ~96%; SMS minus opt-outs; WhatsApp opt-in only) and explains the real
  adapter path.
- Parent **Policies**: a "Your school's policies" section with version badges,
  "acknowledge required" / "acknowledged v#" states and an Acknowledge button.
- Super-admin **Policies**: an "Acknowledgement tracking" card with per-policy
  progress bars (acknowledged %), audience, version and "Remind pending".

## Migration
`prisma/migrations/20260810160000_policy_acks` — additive (1 table + indexes).

## Tests
`tests/phase17d.test.ts` — 8 pure-logic tests. **99 unit tests pass across the project.**

---

# Phase 17e — "What's new" notification inbox (red badge) + external delivery

Parents and teachers are notified of new updates/information **both outside the
app** (push/email/SMS/WhatsApp) **and in-app**, where a red badge shows the
unread count, a "What's new" list shows the items, and each can be marked read.

## Added
- **Pure logic** `inbox-logic.ts` (tested): `unreadCount`/`hasUnread` (the red
  badge; in-app only), `inboxList` (newest-first, de-duped), `summarizeByKind`,
  `groupByDay` (Today/Yesterday/Earlier), `idsToMark`/`applyMarkRead`, `kindMeta`.
- **DB** `inbox.ts`: `getInbox` (feed + unread + per-kind summary), `badgeCount`,
  `markRead`/`markAllRead`, and **`notifyInformation`** — writes the in-app feed
  row (drives the badge) AND fans out to each user's other preferred channels via
  the real adapters (`notify.deliver`), honouring prefs + consent; returns
  per-channel counts. `notifySchoolAudience` targets all parents/teachers.
- **Routes:** `GET/POST /api/me/notifications` (role-agnostic feed + mark read /
  mark all), `GET /api/me/notifications/badge` (cheap count for app-icon badge),
  `POST /api/schools/[id]/notify-info` (staff push new information to
  parents/teachers, in-app + outside the app).
- `deliver()` and `getPrefs()` are reused from notify.ts (email branch now sends
  to the recipient's real address).

## Demo
- **Web**: a red 🔔 badge in the header showing the unread count (parents +
  teachers); clicking opens "What's new" grouped by day with per-item and
  "Mark all as read"; the badge clears as items are read; hidden for roles
  without a feed.
- **Mobile**: a red count badge on the Alerts tab; the "What's new" list with
  unread dots, "Mark read" per item and "Mark all read".

## Tests
`tests/phase17e.test.ts` — 7 pure-logic tests. **106 unit tests pass across the project.**
No schema change (reuses the existing Notification model's `read`/`channel`).
