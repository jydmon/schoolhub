# SchoolHub — Phases 1–14 (complete)

Multi-tenant SaaS platform for **SchoolHub**, connecting schools, parents,
teachers, drivers and transport providers. This repository implements the full
fourteen-phase specification:
**1** SaaS foundation & multi-tenancy · **2** Student/parent/staff data ·
**3** Integration framework · **4** Calendar & daily activities ·
**5** Knowledge Hub & documents · **6** AI knowledge assistant ·
**7** Daily transport · **8** Live GPS/maps/traffic · **9** Same-day trips ·
**10** Residential & overnight trips · **11** Rewards & behaviour integration ·
**12** Communications & notification centre · **13** Operations dashboard &
reporting · **14** Security, compliance & production readiness.

See **DEPLOYMENT.md** and **SECURITY.md** for production, compliance and
safeguarding detail.

## What's in Phase 1

| Area | Implemented |
|------|-------------|
| Multi-tenant architecture | Shared-schema isolation via a `schoolId` discriminator, enforced at the data-access layer (`src/lib/tenant.ts`) |
| Campuses & academy trusts | Schools can belong to a `SchoolGroup` (trust) and own multiple `Campus` records |
| Tenant management | Platform super admin can **create, suspend, reactivate and archive** tenants |
| School configuration | Name, logo, colours, address, contact, time zone, academic year, term dates, notification settings, data retention, enabled modules |
| User roles | Platform Super Admin, School Admin, School Leader, Teacher, Transport Manager, Driver, Parent/Guardian, Support Staff |
| RBAC | Role → permission mapping, tenant-scoped capability checks (`src/lib/rbac.ts`) |
| Authentication | Email/password (bcrypt), JWT httpOnly cookie sessions, password reset, email verification, **TOTP MFA** |
| SSO | Google / Microsoft / SAML / OIDC are stubbed with clear extension points (Phase 2) |
| Audit trail | Append-only log of logins, account/permission/data changes, config, subscription, tenant and AI events |
| Subscriptions | Trial / Basic / Standard / Premium plans with per-school, per-student, per-vehicle pricing, AI usage limits and status/renewal tracking |
| Portals | Platform administration portal and school administration portal |

## What's in Phase 2

| Area | Implemented |
|------|-------------|
| Student profiles | Reference/ID, names + preferred name, DOB, photo, campus, year, class, house, status, admission date, medical-alert / SEND / transport-eligibility indicators |
| Parent & guardian profiles | Contact details, address, preferred language, per-guardian notification preferences, emergency-contact status, collection authorisation |
| Staff profiles | Staff reference, job title, department, roles, classes taught (activities/trips fields reserved for later modules) |
| Relationships | One student ↔ many guardians and one guardian ↔ many students; shared-custody field; per-guardian notification prefs and information restrictions |
| Emergency contacts | Non-user emergency contacts per student, with call priority |
| Approved collectors | Named collectors per student (optionally linked to a guardian user) |
| CSV import | Students, parents and staff importers with downloadable templates |
| Validation & duplicates | Per-row validation, in-file + database duplicate detection, per-row error report, and full import history |

### CSV import

Each importer has a downloadable template (headers + one example row) available
from the **Import** tab, or at `GET /api/schools/{id}/import/template?type=students|parents|staff`.

- **Students** — keyed on `reference`; existing references are updated, new ones created; `className` auto-creates the class; booleans accept `true/false/yes/no/1/0`; dates are `YYYY-MM-DD`.
- **Parents** — keyed on `email`; `childReferences` is a `;`-separated list of student references to link, carrying `relationship`, `collectionAuthorised`, `isEmergencyContact`.
- **Staff** — keyed on `reference` + `email`; `role` must be a valid school role; `classNames` is a `;`-separated list.

Every run is recorded as an `ImportBatch` (import history) with counts and a JSON
error report you can inspect per row.

## What's in Phase 3

| Area | Implemented |
|------|-------------|
| Integration dashboard | Per-school **Integrations** tab: connect systems, see status, last sync, failures, retry, disable/enable, remove |
| Connector framework | Static catalog of 14 connectors (`src/lib/connectors.ts`) with supported methods, owned data domains and default field mappings |
| Integration methods | REST API, webhooks, scheduled sync, secure file transfer (SFTP), CSV import, manual import — plus room for future middleware |
| Sync engine | `src/lib/sync.ts` — creates a `SyncRun` per execution with logs; CSV/manual runs go through the Phase 2 importer; REST/scheduled/SFTP are simulated in this scaffold |
| Data mapping | Editable external-field → SchoolHub-field mappings per integration, with direction (in/out/both) |
| Source of truth | Per-school registry of which system owns each data domain; SchoolHub won't overwrite an integrated domain unless **write-back** is enabled |
| Error handling & retry | Failed syncs record the error and set the integration to `error`; **Retry** re-runs |
| Integration audit trail | Connect / disable / sync / mapping / source / webhook events in the audit log |
| CSV fallback | Any integration can be run as a CSV/manual import when a live API isn't available |
| Webhooks | Public receiver at `POST /api/webhooks/{token}` ingests inbound events as webhook-triggered sync runs |

### Connector catalog

iSAMS, Arbor, Bromcom, SIMS, Google Workspace, Microsoft 365, Google Calendar,
Microsoft Outlook Calendar, Google Drive, SharePoint, Google Maps, GPS tracking
provider, Email provider, and a Behaviour & rewards system.

> **Scaffold note.** With no live third-party credentials, REST/scheduled/SFTP
> syncs are *simulated* — the engine records a representative run rather than
> calling a real API. Set `config.simulateError = true` on an integration to
> exercise the failure + retry path (the seed leaves the GPS connector in an
> error state on purpose). CSV/manual runs are fully functional via the Phase 2
> importer. Wiring real API clients per connector is the next step.

## What's in Phase 4

| Area | Implemented |
|------|-------------|
| School calendar | `CalendarEvent` covering all listed types (term, holiday, INSET, exam, parents' evening, sports day, trip, assembly, club, performance, photos, fundraiser, early closure, timetable change, …) via a `category` |
| Event management | School **Calendar** tab: create/list/delete events with title, description, date, start/end, location, audience (school/year/class/house/club/explicit students), equipment, clothing, packed-lunch, transport, collection time & location, consent, payment reference, reminders and status |
| Homework | `Homework` deadlines with subject and audience, surfaced on the parent dashboard |
| Parent daily dashboard | `/parent` — **Today / Tomorrow / This week / This month**, per-child and **whole-family** views, showing school start time, activities, homework deadlines, equipment, clubs, transport, collection changes, events and **outstanding actions** |
| Reminders | Per-event reminder offsets (1 day / 1 hour / 15 min) emitted as ICS `VALARM`s |
| Consent / payment | Consent-required events create **outstanding actions**; parents respond (give/decline) from the dashboard (`EventConsent`) |
| Calendar export & sync | Per-event **Add to Google / Outlook / Apple (.ics)**, plus a personal **family ICS subscription URL** (`/api/calendar/{token}`) to add once and keep in sync |

Parents are routed to `/parent` on login; staff/admins to the school portal.
Audience resolution (`src/lib/calendar.ts`) decides which children each event
applies to; the dashboard aggregates across every child and school a guardian is
linked to.

## What's in Phase 5 (Knowledge Hub)

| Area | Implemented |
|------|-------------|
| Document repository | `Document` with searchable `bodyText`; source types PDF/Word/text/image/link/email/newsletter/letter (binary text extraction is a plug-in point — paste/extracted text is stored for search) |
| Categories & metadata | Category, title, description, owner, audience, school/campus/year/class, effective / review / expiry dates, version, status, access permissions, archive flag |
| Lifecycle | draft → under_review → approved → published → superseded → archived, with a status endpoint |
| Version control | "New version" clones the document, bumps the version and marks the previous one superseded |
| Approval & publishing | Only **published** documents are searchable by parents; publishing stamps the effective date |
| Email & newsletter ingestion | Connect approved shared mailboxes; ingest newsletters / sent emails as searchable published documents |
| Permission-based access | `docVisibleToParent` / `docSearchableByStaff` gate every read and all AI retrieval |

Managed from the school portal **Knowledge** tab.

## What's in Phase 6 (AI Knowledge Assistant)

| Area | Implemented |
|------|-------------|
| AI chat | Assistant for parents (dashboard **Ask** panel) and staff (portal **Assistant** tab) |
| Knowledge retrieval | `src/lib/ai/retrieval.ts` gathers calendar, homework, events and Knowledge Hub documents; `answer.ts` ranks by keyword relevance |
| Permission filtering | Retrieval filters **before** answering — a record only enters context if the caller may see it (per-school role; parents limited to their children + published parent docs) |
| Source citations | Every answer lists sources with type, label and publication/effective date (and link where available) |
| Not-found / no-guessing | If nothing matches, the assistant says so and refuses to guess |
| Staff analytics | Computed answers for "policies due for review", "outstanding consent", "trips today", "today's activities" (`src/lib/ai/staff.ts`) |
| Multilingual | Language selector; with an LLM key answers come back translated, otherwise a clear note (grounded facts still returned) |
| AI query audit | Every question is stored (`AiQuery`) and written to the audit trail (`AI_QUERY`) |
| AI drafting + confirmation | Draft parent notifications, event summaries, transport-delay messages, consent reminders, policy summaries, translations — nothing is sent until a human **confirms** (`AiDraft`) |

> **AI note.** The answer engine is retrieval-based and **runs fully offline** — it
> composes grounded, cited answers from the permission-filtered records with no
> external calls. If `OPENAI_API_KEY` is set (`src/lib/ai/llm.ts`), the model is
> asked to phrase/translate the answer using *only* that same context; citations
> are always computed from the records regardless. Real PDF/Word text extraction
> and a vector index are the natural next upgrades.

## What's in Phases 7–9 (Transport, GPS, Trips)

| Area | Implemented |
|------|-------------|
| Student transport profiles | Home address/coords, morning/afternoon stops, alternative locations, transport days, AM/PM-only, assigned route/vehicle, accessibility, emergency contact |
| Routes & vehicles | Fixed/flexible routes, ordered stops with planned times, shared collection points, vehicle capacity, driver allocation, per-route cut-off time |
| Daily journeys | Idempotent daily generation from active routes (AM/PM), boarding/drop-off records |
| Parent requests | Cancel (day/AM/PM), report absence, temporary address, change collector, note; **late changes (after cut-off) require staff approval** |
| Driver app (`/driver`) | Assigned journeys, ordered stops, roster with photo initials + medical flag, start / board / absent / not-present / dropped-off / running-late / complete, report incident |
| Parent transport notifications | Route started, approaching, boarded, arrived at school, boarded for return, updated ETA, dropped off, journey complete — in-app feed (`Notification`) |
| Live tracking (Phase 8) | Parent live view: journey status, approximate location, ETA, delay, stops remaining, last update — **own child only**; positions stop after the journey ends |
| Control centre | Active journeys, onboard/absent counts, delays, latest positions, incidents |
| Safeguarding controls | No full routes/other-student addresses to parents; approximate location only; location sharing stops on completion; temporary coach access auto-expires |
| Trips (Phase 9) | Full trip record (destination, departure/return, lead teacher, coach/driver, venue, itinerary, packing list, medical, consent, payment, risk-assessment ref, attachments) |
| Trip allocation | Participating students + staff, lead teacher, per-student consent + attendance |
| Hired coach | Temporary, auto-expiring secure location-sharing link (`/api/trips/coach/{token}` returns 410 after expiry) |
| Teacher trip interface | One-tap updates (assembled, all accounted, departed, arrived, activity/lunch, leaving, running late, coach issue, return, returned) → parent timeline + notifications |
| Parent trip timeline | Consent status, trip details, live teacher updates, return status — own children only |

> **GPS note.** As in Phase 3, there are no live tracking devices here, so vehicle
> position and ETA are **simulated** behind `src/lib/transport.ts` (driver
> "running late (+10)" / "approaching" drive the ETA and notifications). Wire a
> telematics feed + the Google Maps connector for geocoding, traffic-aware ETAs
> and real coordinates. Notifications are a durable in-app feed; push/SMS/email
> delivery is the remaining worker.

## What's in Phases 10–12 (Residential, Rewards, Communications)

| Area | Implemented |
|------|-------------|
| Residential trips | `Trip.isResidential` + end date, accommodation, return plan, medication references; multi-day itinerary (`TripDay`); teacher headcounts / welfare / arrival / evening / emergency snapshots (`TripHeadcount`) |
| Trip photos | `TripPhoto` with `sharedWithParents` — only shared photos reach parents; confidential student info is never shared with other parents |
| Residential parent view | Approved timeline, daily updates, arrival & welfare confirmation, shared photos, return status — own children only |
| Rewards & behaviour | `RewardRecord` (merits, house points, badges, praise, incidents, detentions, sanctions, comments, certificates, attendance awards) received from the behaviour system; staff **Behaviour** tab to view/add |
| Reward notifications | Per-guardian reward preferences (immediate positive / daily / weekly / incident / detention / milestone) honoured on ingest |
| Parent reward dashboard | Points, recent achievements, incidents, a weekly trend, milestone progress bar, source system |
| Private home rewards | `HomeRewardRule` — family-only rules (e.g. "20 points → choose a film"), pausable/deletable, **never visible to staff**, with a guard rejecting harmful/punitive text |
| AI reward questions | Points, achievements this month, why a detention, closeness to a home reward, behaviour trend — from the family's own records (`src/lib/ai/parent.ts`) |
| Notification centre | Compose across **in-app / push / email / SMS / WhatsApp** with targeting (school, campus, year, class, house, route, vehicle, trip, student, parents, staff) and priority |
| SMS & WhatsApp to parents | First-class school→parent text and WhatsApp channels. **WhatsApp opt-in** and **SMS opt-out** are parent-managed (`/api/parent/messaging`, and in the Parent app's Messaging tab) and enforced on send; business-initiated WhatsApp uses approved templates (`src/lib/whatsapp.ts`); inbound **STOP/START** keywords and delivery receipts land on `/api/webhooks/whatsapp` and reconcile per-message status via `Notification.providerId` |
| Preferences | Channels, digest (immediate/daily/weekly), quiet hours, per-child, preferred language, reward prefs — **emergency alerts override** preferences and quiet hours |
| Delivery tracking | Per-recipient per-channel `Notification` rows with status (queued/sent/delivered/read/failed/acknowledged) and external `providerId`; communication history with counts |

> **Channels note.** In-app is real; push / email / SMS / WhatsApp are **adapters**
> that log in console-mode (`src/lib/notify.ts`, `src/lib/sms.ts`,
> `src/lib/whatsapp.ts`) — set `SMS_MODE=twilio` / `WHATSAPP_MODE=cloud` (+ FCM/APNs
> for push, an email provider) to go live. The targeting resolver, consent gating
> (opt-in/opt-out) and per-recipient delivery tracking are real, so this is the
> notification-delivery layer earlier phases fan out from (transport alerts, trip
> updates, reward alerts, calendar reminders).

## What's in Phases 13–14 (Operations, Reporting, Production Readiness)

| Area | Implemented |
|------|-------------|
| Operations dashboard | Live tiles: students present/absent, active buses, delayed routes, students onboard, active/residential trips, events today, outstanding consent, messages needing attention, integration failures, transport incidents (**Operations → Dashboard**) |
| Reporting | Transport punctuality/ETA/missed collections/route performance, trip participation & consent, parent engagement & notification read rate, AI usage & common questions, integration success rate, reward counts (`src/lib/reports.ts`) |
| Export | CSV (real), PDF (dependency-free generator), print; **scheduled reports** (cadence/format/recipients/scope) with school-leader and trust-level scopes; trust roll-up at `/api/groups/{id}/report` |
| Security | bcrypt passwords, TOTP MFA, JWT sessions with **`sessionVersion` revocation** ("sign out everywhere"), per-IP + per-account **rate limiting**, security headers (`src/middleware.ts`), auth→tenant→RBAC on every route, audit/security logging, `/api/health` probe |
| Privacy / compliance | Per-school regime (UK GDPR/DPA or FERPA), retention policy + **purge**, **data subject requests** (export bundle + erasure/anonymise), school-specific privacy toggles, child-location privacy |
| Safeguarding | Medical/SEND/location redaction for non-senior staff (`src/lib/safeguarding.ts`), driver access limited to active assignments, auto-expiring hired-coach links, **emergency escalation** (overrides prefs + quiet hours), safeguarding audit logs |
| Reliability | `/api/health`, notification-retry endpoint, integration retry (Phase 3), idempotent driver/teacher actions for offline replay; backup/DR/HA/monitoring documented in DEPLOYMENT.md |
| Production | Dockerfile, `.env.production.example`, DEPLOYMENT.md (Postgres migration, background jobs, live adapters, DR/HA), SECURITY.md (controls, compliance, safeguarding, incident response) |

> **Operational note.** Encryption at rest, backups, DR, HA, penetration testing
> and monitoring are infrastructure/process concerns — they're delivered as
> documented configuration + hooks (`/api/health`, retention/retry endpoints,
> `sessionVersion`, security headers), not as in-app code, because that's where
> they belong. The report **PDF** is a minimal built-in generator; swap for a
> full PDF lib if you need rich layout.

## Mobile apps (Day-1 core requirement)

Native iOS and Android apps for **Parents, Teachers, Drivers and School
Administrators**, built from **one shared Expo / React Native codebase** in
`mobile/`, calling the **same backend APIs** with the same RBAC, tenancy, audit
and notification centre. A single install renders the right role experience from
the server's `appRole`. Highlights: secure login + **Face ID / fingerprint**
unlock, multi-child parent dashboard, driver boarding board, teacher trip &
welfare updates, admin operations + emergency broadcast, grounded AI assistant,
**offline-first** reads with a durable auto-syncing write queue, push
notifications honouring existing categories/quiet-hours/per-child preferences,
and deep linking. Full architecture, feature→app matrix and requirement status:
**`MOBILE.md`**; how to run it: **`mobile/README.md`**.

## Tech stack

- **Next.js 14** (App Router, TypeScript) — API route handlers + server/client components
- **Expo / React Native** (TypeScript) — shared mobile app for four roles (`mobile/`)
- **Prisma** ORM — **SQLite** for zero-setup local dev; **Postgres-ready** for production
- **bcryptjs** + **jsonwebtoken** for auth, **otplib** for TOTP MFA, **zod** for validation

## Quick start

```bash
npm install
cp .env.example .env        # a working .env is already included for local dev
npm run setup               # prisma generate + db push + seed
npm run dev                 # http://localhost:3000
```

`npm run setup` is shorthand for `prisma generate && prisma db push && tsx prisma/seed.ts`.
To wipe and reseed: `npm run db:reset`.

## Demo logins (from the seed)

| Role | Email | Password |
|------|-------|----------|
| Platform Super Administrator | `admin@schoolhub.dev` | `ChangeMe!123` |
| School Administrator (Northwind) | `alice@northwind.test` | `Password123!` |
| School Leader (Riverside) | `grace@riverside.test` | `Password123!` |
| Teacher | `tom@northwind.test` | `Password123!` |
| Parent / Guardian | `sarah@parents.test` | `Password123!` |

The platform admin lands on `/admin`; school users land on `/school`. Each seeded
school comes with classes, students (siblings sharing a parent to show the
one-parent-many-children relationship), staff profiles, an emergency contact, an
approved collector and a sample import-history entry — open a school and use the
**Students / Guardians / Staff / Calendar / Import / Integrations** tabs. Sign in
as **`sarah@parents.test`** to land on the parent family dashboard — the seed adds
a week of Northwind events (assembly, chess club, sports day, a consent-required
zoo trip, parents' evening, an INSET day) and two homework deadlines, plus a
Knowledge Hub (uniform/behaviour/safeguarding policies, an absence FAQ, a
newsletter, a lunch menu). Try the **Ask** panel: "What is the uniform policy?",
"When is Sports Day?", "How do I report an absence?". As the school admin, the
**Assistant** tab answers staff questions ("Which policies are due for review?")
and offers AI drafting with a confirm step. Sign in as the driver
**`dan@northwind.test`** / `Password123!` for the driver app — the seed creates a
live morning journey on the Green Lane Run with Ella already boarded. As a parent,
the dashboard now shows live bus tracking, a transport-change request form, the
Science Museum trip timeline with a pending consent, and a notifications feed.

> Email is not actually sent in Phase 1 — verification / reset / invite links are
> printed to the server console and recorded in the audit log (`EMAIL_MODE=console`).

## Moving to Postgres (production)

1. In `prisma/schema.prisma` set `datasource db { provider = "postgresql" }`.
2. Point `DATABASE_URL` at your Postgres instance.
3. `npx prisma migrate dev` (switch from `db push` to migrations for prod).

The schema avoids SQLite-only features and models enums as validated strings,
so the same schema and code run unchanged on Postgres.

## Project layout

```
prisma/
  schema.prisma        # multi-tenant data model
  seed.ts              # plans, super admin, demo trust + 2 schools
src/lib/
  db.ts                # Prisma singleton
  auth.ts              # passwords, JWT sessions, one-time tokens
  session.ts           # cookie session + requireAuth / requirePlatformAdmin
  rbac.ts              # roles, permissions, capability checks
  tenant.ts            # tenant-isolation guards and scoped queries
  mfa.ts               # TOTP
  audit.ts             # append-only audit logging
  csv.ts               # dependency-free CSV parser + import templates
  import.ts            # CSV import engine (validation, dedup, error report)
  connectors.ts        # Phase 3 connector catalog (14 templates, methods, domains, mappings)
  sync.ts              # Phase 3 synchronisation engine (CSV fallback + simulated pulls)
  calendar.ts          # Phase 4 audience resolver, ICS generator, Google/Outlook links
  parent.ts            # Phase 4 parent dashboard aggregation (ranges, per-child/family)
  documents.ts         # Phase 5 document visibility rules + searchable text
  ai/retrieval.ts      # Phase 6 permission-filtered multi-source retrieval
  ai/answer.ts         # Phase 6 keyword ranking + grounded answer composer
  ai/staff.ts          # Phase 6 computed staff-operational answers
  ai/llm.ts            # Phase 6 optional LLM backend (offline without a key)
  transport.ts         # Phase 7/8 notifications, ETA, journey progress (simulated GPS)
  driver.ts            # Phase 7 driver-journey auth + roster resolver
  notify.ts            # Phase 12 prefs, targeting resolver, channel fan-out + delivery
  ai/parent.ts         # Phase 11 parent reward/behaviour analytics for the assistant
  reports.ts           # Phase 13 ops dashboard, report builders, CSV/PDF, trust roll-up
  ratelimit.ts         # Phase 14 in-memory rate limiter
  safeguarding.ts      # Phase 14 medical/SEND/location redaction
  validation.ts        # zod request schemas
src/middleware.ts      # Phase 14 security headers + auth rate limiting
  constants.ts         # roles, permissions, modules, plans, audit actions, people & integration reference data
src/app/api/           # route handlers: auth, schools, config, users, subscription, audit,
                       #   groups, plans, students, guardians, staff, import, connectors,
                       #   integrations (+ sync/runs/mappings), sources, webhooks
src/app/login          # sign-in (with MFA prompt)
src/app/admin          # platform administration portal
src/app/school         # school portal (… Transport / Trips / Behaviour / Comms / Knowledge / Assistant / …)
src/app/parent         # parent dashboard (calendar, Ask, transport, trips+residential, rewards, home rules, preferences, notifications)
src/app/driver         # driver app (assigned journeys, boarding, incidents)
src/app/api/ai         # ask / draft / drafts (AI assistant + drafting)
src/app/api/driver     # driver journey actions (start/board/position/complete/incident)
src/app/api/trips      # teacher trip updates + hired-coach share link
src/app/api/mobile     # bootstrap, sync delta, SSE stream, device (push token) registration
mobile/                # shared Expo/RN app — see mobile/README.md
  App.tsx              # navigation + auth + deep linking
  src/navigation/      # RootNavigator: role gate → parent|teacher|driver|admin
  src/apps/            # parent.tsx · teacher.tsx · driver.tsx · admin.tsx
  src/auth/            # AuthContext (login, biometric unlock, bootstrap) + LoginScreen
  src/offline/         # cache store + durable write queue
  src/push/            # push token registration
  src/api/ · src/ui/   # fetch client (keychain session) + shared UI kit
```

## Security notes

- Tenant isolation is enforced by `assertTenantAccess` on every tenant-scoped
  route plus mandatory `schoolId` filtering — a request can never read another
  school's data.
- Sessions are signed JWTs in httpOnly, SameSite=Lax cookies (`Secure` in prod).
- MFA (TOTP) is available to all users and expected for privileged roles.
- **Change `JWT_SECRET` and all seeded passwords before any real deployment.**

## Known plug-in points

All fourteen phases are implemented. What remains is swapping simulated adapters
for live providers and standing up infrastructure — the interfaces and process
docs are in place:

- **Channel delivery** — `src/lib/notify.ts` fans out across in-app, push, email, **SMS** (`src/lib/sms.ts`) and **WhatsApp** (`src/lib/whatsapp.ts`). Adapters log in console-mode; set `SMS_MODE=twilio` / `WHATSAPP_MODE=cloud` (+ provider env) to go live. In-app, targeting, consent gating and delivery tracking are real. WhatsApp is **opt-in** and SMS is **opt-out**, both parent-managed (`/api/parent/messaging`) and honoured on send; inbound STOP/START and delivery receipts arrive on `/api/webhooks/whatsapp`.
- **Live GPS / maps** — Phase 7/8 position & ETA are simulated in `src/lib/transport.ts`; connect telematics + the Phase 3 Google Maps connector for real coordinates and traffic-aware ETAs.
- **Live connector clients & SSO** — Phase 3 REST/scheduled/SFTP pulls are simulated; add per-vendor API clients and OAuth/SAML sign-in.
- **AI upgrades** — set `OPENAI_API_KEY` for live phrasing/translation; add PDF/Word text extraction (OCR) and a vector index.
- **Digest scheduler** — daily/weekly digests are modelled as preferences; a scheduled job would batch and send them.
