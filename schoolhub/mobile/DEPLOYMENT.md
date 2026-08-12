# SIPlat mobile — build & release to the App Store and Google Play

The SIPlat mobile app is one Expo / React Native codebase (`mobile/`) that ships
to **iOS** and **Android**. Builds run on **Expo Application Services (EAS)** in
the cloud — no Mac required — and are triggered from **GitHub Actions**. EAS also
submits the finished binaries to App Store Connect and Google Play.

- **App name:** SIPlat
- **Bundle id / package:** `com.siplat.app`
- **URL scheme / deep links:** `siplat://`
- **Backend API:** `https://dev.siplat.com` (per build profile in `eas.json`)
- **Brand colour:** `#4F46E5`

---

## 1. One-time accounts you need

| Store | Account | Notes |
|-------|---------|-------|
| Expo | Free account at [expo.dev](https://expo.dev) | Runs the builds. |
| Apple | **Apple Developer Program** ($99/yr) + App Store Connect | Create an app record with bundle id `com.siplat.app`. |
| Google | **Google Play Console** ($25 one-time) | Create an app; you also need a **service account JSON** (below). |

## 2. One-time project setup (run locally, once)

```bash
cd mobile
npm install
npm i -g eas-cli          # or use: npx eas-cli@latest ...
eas login                 # sign in to your Expo account
eas init                  # creates the EAS project
```

`eas init` writes a real **projectId** into `app.json` — replace the
`REPLACE_WITH_EAS_PROJECT_ID` placeholder with what it generates, and commit.

Generate signing credentials (EAS can manage everything for you):

```bash
eas credentials          # iOS: distribution cert + provisioning profile
                         # Android: upload keystore (let EAS generate it)
```

> Keep the Android keystore safe — losing it means you can't update the app.
> `eas credentials` stores it on EAS; export a backup with the same command.

## 3. Store-submission credentials

Fill the placeholders in **`eas.json` → `submit.production`**:

**iOS** — create an **App Store Connect API key**
(App Store Connect → *Users and Access → Integrations → App Store Connect API* →
generate a key with the *App Manager* role). You get a `.p8` file, a **Key ID**
and an **Issuer ID**.
- Set `ascAppId` (the app's numeric Apple ID from App Store Connect) and
  `appleTeamId` in `eas.json`.
- Register the API key with EAS: `eas credentials` (iOS → *App Store Connect API Key*),
  or store it as an EAS secret so CI can submit headlessly (see §5).

**Android** — create a **Google Play service account**
(Play Console → *Setup → API access* → create/link a Google Cloud service account,
grant it *Admin (all permissions)* or at least *Release* on your app, and download
its **JSON key**).
- Save the JSON as `mobile/google-play-service-account.json` (git-ignored), or
  upload it as an EAS secret (§5). `eas.json` already points at that path.

## 4. GitHub secret

Add **one** repository secret (Settings → *Secrets and variables → Actions*):

| Secret | Where to get it |
|--------|-----------------|
| `EXPO_TOKEN` | expo.dev → *Account settings → Access tokens* → create token |

That's all the Actions workflow needs to build. For **submitting from CI**, the
Apple/Google credentials must also be reachable by EAS — the simplest robust
option is to store them as **EAS secrets** (§5) so `--auto-submit` works headlessly.

## 5. (Recommended) EAS secrets for headless submission

```bash
# Google Play service account JSON as an EAS file secret
eas secret:create --scope project --name GOOGLE_PLAY_SERVICE_ACCOUNT \
  --type file --value ./google-play-service-account.json

# App Store Connect API key parts (if not using eas credentials)
eas secret:create --scope project --name ASC_API_KEY --type file --value ./AuthKey_XXXX.p8
eas secret:create --scope project --name ASC_KEY_ID   --value <KEY_ID>
eas secret:create --scope project --name ASC_ISSUER_ID --value <ISSUER_ID>
```

EAS-managed credentials (via `eas credentials`) are picked up automatically by
`eas submit`, so for most teams §2–§3 is enough and §5 is optional.

## 6. Building & releasing

**From GitHub (recommended):** Actions → **“Mobile — EAS build & submit”** →
*Run workflow* → pick platform (`all`/`ios`/`android`), profile (`production`),
and tick **submit** to push to the stores after the build.

**By tag:** pushing a tag builds *and* submits production for both platforms:
```bash
git tag mobile-v1.0.0 && git push origin mobile-v1.0.0
```

**Locally:**
```bash
cd mobile
npm run build:production     # eas build --profile production --platform all
npm run submit               # eas submit --profile production --platform all
```

`preview` profile builds an internal-distribution **APK** (Android) and an
ad-hoc **IPA** (iOS) for testers, pointing at the same API.

## 7. Versioning

- **`app.json → expo.version`** is the marketing version (e.g. `1.0.0`) shown in
  the stores — bump it for every public release.
- **Build numbers** (iOS `buildNumber`, Android `versionCode`) auto-increment on
  EAS because `eas.json` sets `appVersionSource: remote` + `autoIncrement`. You
  don't edit them by hand.

## 8. First-submission checklist

- App Store Connect: app record created, screenshots (6.7" + 5.5" iPhone, 12.9"
  iPad if you keep `supportsTablet`), description/keywords (see `store/app-store.md`),
  privacy policy URL, age rating, "Sign in" demo account for review.
- Google Play: store listing, **Data safety** form (see `store/google-play.md`),
  content rating questionnaire, target audience, privacy policy URL, closed/internal
  testing track before production.
- A public **privacy policy URL** is required by both stores — host one at e.g.
  `https://siplat.com/privacy` and reference it in both listings.

## 9. What's already configured in this repo

- `app.json` — SIPlat identity, `com.siplat.app`, icons, splash, permissions with
  human-readable usage strings, notification icon, deep-link scheme.
- `eas.json` — `development` / `preview` / `production` build profiles + submit config.
- `assets/` — app icon (opaque, App-Store-safe), Android adaptive icon, splash
  mark, monochrome notification icon, favicon.
- `.github/workflows/mobile.yml` — cloud build + optional auto-submit.
- `store/` — ready-to-paste listing copy and Data-safety notes.
