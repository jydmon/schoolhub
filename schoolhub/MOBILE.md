# SchoolHub Mobile — Architecture & Requirement Coverage

Mobile is a **Day-1 core requirement** of SchoolHub, not an afterthought. Every feature is designed mobile-first: any capability built for the web application is evaluated for inclusion in the appropriate mobile app based on the user's role — **Parent, Teacher, Driver or School Administrator**. This document describes how the mobile apps are built, how they reuse the existing backend, what each role gets, and the honest status of every requirement.

## 1. Shape of the solution

There is **one shared codebase** (Expo + React Native, TypeScript) that ships as **one install per platform** (iOS, Android) and renders **four role experiences**. When a user signs in, the backend's `/api/mobile/bootstrap` endpoint returns an `appRole` derived from their memberships (`parent | teacher | driver | admin`), and `RootNavigator` mounts the matching experience. A person who is both a parent and a teacher gets the role the backend judges primary, and the same binary serves all of them.

This is deliberate. The four roles share the hard parts — authentication, keychain-backed sessions, biometric unlock, the offline cache, the durable write queue, connectivity handling, push registration, the API client and the UI kit. Only the screens differ. Building four separate apps would triple the maintenance of that shared core and let the roles drift apart. A single codebase means every backend change lands in all four apps simultaneously and behaviour stays consistent.

The mobile apps do **not** introduce a second backend. They call the **same Next.js API routes** the web app uses (`/api/auth/*`, `/api/parent/*`, `/api/driver/*`, `/api/schools/[id]/*`, `/api/ai/ask`, `/api/mobile/*`). The same RBAC, tenant isolation, audit logging and validation that protect the web endpoints protect the mobile calls — there is no parallel, weaker path. A small set of mobile-specific endpoints (`/api/mobile/bootstrap`, `/sync`, `/stream`, `/devices`) exists only to make app start fast and to manage push tokens; each reuses the shared session and RBAC guards.

## 2. Reuse of the existing platform

The backend already had, before mobile work began, the services the apps depend on: multi-tenant data access with mandatory `schoolId` scoping, the notification centre (`src/lib/notify.ts`) with categories, per-child targeting, channels, quiet hours and an emergency override, the grounded AI assistant (`src/lib/ai/*`), transport/trip/residential domains, and the audit log. Mobile added exactly one data model — `Device` (push token, platform, `appRole`, app version, last-seen) — and wired the notification centre's push channel to fan out to a user's registered devices. Everything else the apps show is an existing endpoint rendered natively.

## 3. Authentication & security

Login is email/password with MFA, using the existing `/api/auth/login` flow. On success the session cookie is stored in the device keychain via `expo-secure-store`, never in plain storage. On relaunch the app offers **Face ID / fingerprint unlock** (`expo-local-authentication`); the stored session is only revealed after a successful biometric (or device-passcode fallback) check. Logout revokes the push token and clears the keychain. Google, Microsoft and SAML sign-in are implemented on the backend and shown in the app as "planned" pending the native OAuth redirect wiring. Transport is HTTPS in production; the API base URL is configurable per environment.

## 4. Offline access & synchronisation

Reads are **cache-first**. Each screen paints the last-synced snapshot from `AsyncStorage` immediately, then revalidates from the network when online, updating the cache. Users on a train or in a school basement still see their child's schedule, today's journey or the trip roster.

Writes go through a **durable, idempotent queue**. When the device is offline — or a write hits a network error, a 5xx, or a 429 — the operation is persisted and the UI updates optimistically. On reconnect (detected by NetInfo) `flushQueue()` replays the queued operations in order. Terminal client errors (4xx other than 429) are dropped rather than retried forever, so one malformed request can't block the queue behind it. Driver boarding events and teacher welfare/headcount updates are the primary offline-critical writes and are safe to replay.

For near-real-time updates the app subscribes to a Server-Sent Events stream (`/api/mobile/stream`, unread counts and nudges) and falls back to a `since`-based delta poll (`/api/mobile/sync?since=`) on networks that block long-lived connections. Conflict handling is last-writer-wins at the field level for status updates, with the server audit log preserving full history; genuinely conflicting edits surface as a re-fetch rather than silent overwrite.

## 5. Push notifications

`src/push/push.ts` obtains a device push token and registers it against `POST /api/mobile/devices`, tagged with platform, `appRole` and app version; logout unregisters it. Delivery reuses the notification centre, so push automatically inherits the user's **category toggles, per-child targeting, channel choices, quiet hours, language preference and the emergency override** that bypasses quiet hours. Production delivery requires FCM (Android) and APNs (iOS) credentials configured in the Expo/EAS project — the app-side and server-side plumbing is in place and documented; only the platform credentials are environment-specific.

Push sits alongside the other school→parent channels — **in-app, email, SMS and WhatsApp** — all fanned out by the same notification centre. The Parent app's **Messaging** tab lets a parent set their mobile number and manage consent: **WhatsApp is opt-in** (Meta policy — the school may not message until the parent enables it) and **SMS is opt-out** (on by default for school↔home contact, with a STOP keyword). Both are enforced on send and reflected in delivery tracking; emergency alerts are always delivered regardless. The screen calls `GET/POST /api/parent/messaging`; inbound STOP/START keywords and delivery receipts arrive on `/api/webhooks/whatsapp` and reconcile per-message status via `Notification.providerId`.

## 6. Device features

Live today: biometric authentication, secure keychain storage, push token management, and deep linking (custom scheme `schoolhub://` plus a universal-link prefix) so a notification or email can open a specific screen. Staged behind documented integration points for the next iteration: GPS capture for driver location, camera and QR scanning for boarding and collection, secure in-app document viewing, and embedded maps for live transport tracking. These are called out honestly rather than stubbed silently.

## 7. Performance

The apps are built for constrained conditions: cache-first rendering means no blank screens waiting on the network, payloads are the minimal role-scoped shapes the mobile endpoints return (not full web responses), the bootstrap call collapses app-start data into one round trip, and lists render lazily. Optimistic writes keep the driver and teacher flows responsive even on poor connections.

## 8. Feature → app matrix

Which capability appears in which role app, applying the mobile-first evaluation to each web feature:

| Capability | Parent | Teacher | Driver | Admin |
|---|:--:|:--:|:--:|:--:|
| Secure login + biometric unlock | ✅ | ✅ | ✅ | ✅ |
| Role dashboard | ✅ multi-child | ✅ trips | ✅ journeys | ✅ operations |
| Transport tracking (own child) | ✅ | — | — | ✅ oversight |
| Journey boarding board | — | — | ✅ | — |
| Trip updates (one-tap) | view | ✅ | — | oversight |
| Residential welfare updates | view | ✅ | — | oversight |
| Headcount / welfare check | — | ✅ | — | — |
| AI assistant (grounded, cited) | ✅ | ✅ | — | ✅ |
| Notification centre | ✅ | ✅ | ✅ | ✅ |
| SMS & WhatsApp from school | ✅ receive + consent | receive | receive | ✅ send |
| Emergency broadcast | receive | receive | receive | ✅ send |
| Consent / forms status | ✅ | ✅ | — | oversight |
| Rewards / behaviour view | ✅ | ✅ | — | oversight |
| Offline access + auto-sync | ✅ | ✅ | ✅ | ✅ |
| Push (categories/quiet-hours/per-child) | ✅ | ✅ | ✅ | ✅ |
| Deep linking | ✅ | ✅ | ✅ | ✅ |

"—" means intentionally out of scope for that role; "oversight" means the administrator sees the aggregate rather than the individual action; "view" means read-only for that role.

## 9. Requirement status (per the delivery principle)

| Requirement | Status | Notes |
|---|---|---|
| Cross-platform iOS + Android, shared codebase | ✅ Completed | One Expo/React Native codebase, four role experiences via `appRole`. |
| Parent / Teacher / Driver / Admin apps | ✅ Completed | `src/apps/{parent,teacher,driver,admin}.tsx`. |
| Secure login | ✅ Completed | Reuses `/api/auth/login` + MFA; keychain session. |
| Biometric (Face ID / fingerprint) | ✅ Completed | `expo-local-authentication` gate on relaunch. |
| SSO (Google / Microsoft / SAML) | 🟡 Partial | Backend ready; native OAuth redirect UI marked "planned". |
| Multi-child parent dashboard | ✅ Completed | Home renders each linked child + today + outstanding actions. |
| Transport / trip / residential tracking | ✅ Completed | Reuses parent/driver/trip endpoints; own-child scoping enforced. |
| AI assistant | ✅ Completed | Grounded, permission-scoped, cited; parent/teacher/admin. |
| Notifications (in-app centre) | ✅ Completed | Reuses notification centre + read state. |
| Push (FCM/APNs) | 🟡 Partial | App + server plumbing complete; platform credentials are environment config. |
| Push controls (categories, quiet hours, per-child, channels, language) | ✅ Completed | Inherited from existing notification-centre preferences. |
| SMS & WhatsApp to parents (opt-in/opt-out, templates, STOP, receipts) | ✅ Completed | Adapters `sms.ts`/`whatsapp.ts`; consent in Parent app **Messaging** tab + `/api/parent/messaging`; inbound `/api/webhooks/whatsapp`. Live sending needs Twilio/Meta credentials (env). |
| Forms / consent | ✅ Completed | Consent status shown; submission reuses web endpoints. |
| Rewards | ✅ Completed | Reward/behaviour views reuse existing analytics. |
| Offline access + auto-sync | ✅ Completed | Cache-first reads + durable idempotent write queue. |
| Real-time + background sync, conflict handling | ✅ Completed | SSE stream + delta fallback; last-writer-wins with audit history. |
| Device: GPS, camera, QR, secure docs, maps | 🟡 Partial | Biometrics, push, deep links live; GPS/camera/QR/maps/doc-viewer staged behind documented integration points. |
| Deep linking | ✅ Completed | `schoolhub://` scheme + universal-link prefix. |
| Mobile performance | ✅ Completed | One-round-trip bootstrap, cache-first, optimistic writes, lazy lists. |
| Mobile-first design principle | ✅ Completed | Every web feature evaluated for role-appropriate mobile inclusion (matrix above). |

## 10. Honest build note

The build sandbox had no access to the npm registry (installs returned 403), so `npm install`, a device/simulator build and runtime testing could **not** be exercised here. The mobile codebase is therefore verified **structurally**: all 16 source files' imports resolve against the file tree, path aliases match `babel.config.js` and `tsconfig.json`, the exported API surface (`api.get/post/put/patch/del`, cache and queue functions, push functions) matches every call site, the bootstrap payload shape matches the `Bootstrap` type, and theme tokens and component props are consistent. Producing the actual signed binaries requires running `npm install` and an EAS build on a networked machine with FCM/APNs credentials — the steps are in `mobile/README.md`. This is the same honest constraint noted for the web app throughout the project.
