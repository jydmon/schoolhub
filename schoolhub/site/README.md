# SIPlat public site (landing page + marketing website)

This folder is the **public-facing site** — separate from the Next.js **web app** in
the repo root.

## Live layout

| Part | What it is | Domain |
|---|---|---|
| **This `site/` folder** | Static landing page + marketing website | **`https://siplat.com`** (apex — Hostinger web hosting → `public_html`, or any static host) |
| **The Next.js app** (repo root) | The logged-in product (parent/school/driver/admin portals + APIs) | **`https://dev.siplat.com`** (Hostinger VPS — see `../SIPlat-Hostinger-Deployment.md`) |

The marketing site is public — it has **no "Log in" button**. Staff and parents sign in
directly at the app, **`https://dev.siplat.com/login`** (e.g. from a bookmark or an email link).

## Files

- **`index.html`** — the landing page. Its interest form uses **FormSubmit**, so it works
  as a pure static page with **no backend**. Submissions email `de.sobra.ltd@gmail.com`.
  The first submission from the live URL triggers a one-time "Activate Form" confirmation email.
  This is the recommended page to deploy at `siplat.com`.
- **`website.html`** — the fuller marketing website. Its "Subscribe now" form **POSTs to
  `https://dev.siplat.com/api/public/subscribe`**, which creates a de-duplicated CRM contact.
  (The app allows this cross-site call via its `MARKETING_ORIGIN` CORS allowlist — set that env
  var to `https://siplat.com,https://www.siplat.com`.) If you move the app, change `APP_URL`
  near the bottom of this file's `<script>`.
- **`demo/web.html`**, **`demo/mobile.html`** — self-contained product demos to link from the
  site ("See a demo") or host at `/demo/`.

## Deploy the static site — Hostinger web hosting (siplat.com)

1. In hPanel → `siplat.com` → **File Manager**, open `public_html`.
2. Upload the **contents** of this `site/` folder, so `index.html` lands at `public_html/index.html`.
3. hPanel → **SSL** → issue/enable the certificate for `siplat.com` (and `www`).
4. Visit `https://siplat.com` — the landing page loads. (The app sign-in lives at
   `https://dev.siplat.com/login`, not on the marketing site.)

Or connect this repo via GitHub in hPanel and set the deploy path to `public_html`
(see the Hostinger guide, "Track 1").

## DNS (at your domain registrar / Hostinger DNS)

| Record | Name | Value |
|---|---|---|
| A | `@` (siplat.com) | your **web hosting** IP |
| A | `www` | your **web hosting** IP |
| A | `dev` (dev.siplat.com) | your **VPS** IP |

Then run Certbot on the VPS for `dev.siplat.com` (see the deployment guide).
