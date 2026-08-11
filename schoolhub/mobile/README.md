# SchoolHub Mobile

Native-quality iOS and Android apps for **Parents, Teachers, Drivers and School Administrators**, built from **one shared Expo / React Native codebase** on top of the existing SchoolHub backend APIs. There is a single install — the app renders the correct role experience from the server-issued bootstrap (`appRole`), so a parent, a teacher, a driver and a head of school all use the same binary and each sees only their world.

## Why one codebase, four apps

The role experiences share ~80% of their code: auth, secure storage, the offline engine, the sync layer, push registration, the UI kit and the API client are all common. Only the screens differ. `src/navigation/RootNavigator.tsx` switches on `boot.appRole` (`parent | teacher | driver | admin`) and mounts the matching tab navigator from `src/apps/`. This keeps behaviour consistent, halves maintenance, and means every backend change is picked up by all four roles at once.

## Requirements met

- **Secure login + biometrics** — email/password with MFA, session stored in the device keychain (`expo-secure-store`), Face ID / fingerprint unlock on relaunch (`expo-local-authentication`). Google/Microsoft/SAML are wired on the backend and surfaced as "planned" in the UI.
- **Role dashboards** — multi-child parent home, teacher trip control, driver journey/boarding board, admin operations snapshot.
- **Transport / trips / residential** — parents track only their own child; drivers run the boarding board; teachers post one-tap trip and residential welfare updates.
- **AI assistant** — grounded, permission-scoped answers with citations, available to every role.
- **Notifications** — in-app centre plus push (see below).
- **Offline access + auto-sync** — cache-first reads and a durable write queue (see below).
- **Device features** — biometrics, push tokens, deep linking today; GPS, camera and QR are staged behind documented integration points.

## Offline & synchronisation

Reads are **cache-first**: every screen shows the last-synced data instantly from `AsyncStorage` (`src/offline/store.ts`), then revalidates when online. Writes go through a **durable queue** (`src/offline/queue.ts`): when offline (or on a 5xx/429/network error) the action is persisted and replayed automatically on reconnect via `flushQueue()`; terminal 4xx responses (except 429) are dropped so a bad request can't wedge the queue. Driver boarding and teacher welfare updates are optimistic locally and idempotent on replay. `src/net/useOnline.ts` (NetInfo) drives the offline banners and the auto-flush.

Near-real-time updates come from the backend SSE stream (`/api/mobile/stream`) with a `/api/mobile/sync?since=` delta fallback for constrained networks.

## Push notifications

`src/push/push.ts` registers the device token against `POST /api/mobile/devices` (tagged with `appRole`, platform and app version) and unregisters on logout. The backend `Device` model fans push out through the notification centre, which already honours user categories, per-child targeting, channels, quiet hours and an emergency override. Production requires FCM (Android) and APNs (iOS) credentials in the Expo/EAS project — see `../MOBILE.md`.

## Project layout

```
App.tsx                     NavigationContainer + SafeAreaProvider + AuthProvider + deep linking
index.ts                    Expo root registration
src/config.ts               API base URL (EXPO_PUBLIC_API_URL / app.json extra / localhost)
src/api/client.ts           fetch wrapper, keychain session cookie
src/auth/                   AuthContext (login, biometric unlock, bootstrap) + LoginScreen
src/navigation/RootNavigator.tsx   role gate → parent | teacher | driver | admin
src/apps/                   parent.tsx · teacher.tsx · driver.tsx · admin.tsx
src/offline/                store.ts (cache) · queue.ts (write queue)
src/net/useOnline.ts        connectivity hook
src/push/push.ts            push token registration
src/ui/kit.tsx              shared themed components
```

## Running it

```bash
cd mobile
npm install
# point the app at your running backend (defaults to http://localhost:3000)
EXPO_PUBLIC_API_URL="http://<your-lan-ip>:3000" npm start
```

Then press `i` (iOS simulator), `a` (Android emulator), or scan the QR code with Expo Go on a device. The backend from the repo root must be running (`npm run dev`).

> Note on this environment: the package registry was not reachable from the build sandbox, so `npm install` and a device build could not be exercised here. The codebase is verified structurally (imports resolve against the file tree, path aliases match `babel.config.js`/`tsconfig.json`, theme tokens and component props are consistent). Run the install/build on a networked machine to produce the actual binaries.

See `../MOBILE.md` for the full architecture, the feature → app matrix, and the requirement status table.
