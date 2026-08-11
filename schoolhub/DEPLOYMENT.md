# SchoolHub — Production Deployment

This covers taking SchoolHub from the zero-setup SQLite dev build to a production
deployment. The application code is production-shaped; the items below are the
operational glue.

## 1. Database (Postgres)

1. In `prisma/schema.prisma` set `datasource db { provider = "postgresql" }`.
2. Point `DATABASE_URL` at your Postgres instance (managed Postgres recommended — RDS, Cloud SQL, Neon, Supabase).
3. Use migrations instead of `db push`:
   ```bash
   npx prisma migrate deploy    # applies committed migrations
   ```
   (Generate them in dev with `npx prisma migrate dev --name init`.)
4. **Encryption at rest** is provided by the database/disk layer — enable it on your managed Postgres and object storage.

## 2. Environment

Copy `.env.production.example` → `.env` (or set in your platform) and fill:

- `DATABASE_URL` — Postgres connection string.
- `JWT_SECRET` — long random string (rotate via secret manager).
- `APP_URL` — public HTTPS URL.
- `SESSION_TTL_SECONDS`.
- `CRON_SECRET` — shared secret required by scheduled-job endpoints (e.g. pupil report release, integration sync). If unset, those endpoints are open (dev only).
- `INTEGRATION_ENC_KEY` — 32-byte key (hex or base64) for the Integration Hub credential vault (AES-256-GCM). Generate with `openssl rand -hex 32`. REQUIRED in production; if unset, a key is derived from `JWT_SECRET` (flagged as insecure on the Hub dashboard).
- Provider keys as you wire live adapters: `OPENAI_API_KEY` (AI), email/SMS/push provider creds.

Never commit secrets. Use your platform's secret store (Vault, SSM, Doppler, platform env).

## 3. Build & run

```bash
npm ci
npm run build          # prisma generate + next build
npm start              # next start (Node server)
```

**TLS in transit**: terminate HTTPS at your load balancer / platform. HSTS is set
in `src/middleware.ts`; force HTTPS at the edge.

### Docker

A `Dockerfile` is included. Build and run:
```bash
docker build -t schoolhub .
docker run -p 3000:3000 --env-file .env schoolhub
```

## 4. Background jobs (cron/worker)

Several features persist state and expect a scheduled worker to act on it. Wire
these to your scheduler (platform cron, a small worker dyno, or a queue):

| Job | What it does | Endpoint / action |
|-----|--------------|-------------------|
| Scheduled reports | Generate + email each active `ScheduledReport` at its cadence | build via `src/lib/reports.ts`, deliver by email |
| Pupil report release | Publish embargoed report batches at their release time + notify guardians | `POST /api/cron/release-reports` (send `Authorization: Bearer $CRON_SECRET`); run every minute. Idempotent. |
| Integration sync | Run due scheduled connectors | `POST /api/cron/integration-sync` (`Authorization: Bearer $CRON_SECRET`); run every 5–15 min. Skips connectors already running. REST/SFTP transports are simulated until real adapters are wired (see INTEGRATION-HUB.md). |
| Retention purge | Apply each school's retention policy | `POST /api/schools/{id}/retention/purge` |
| Notification retry | Re-attempt failed/queued deliveries | `POST /api/schools/{id}/notifications/retry` |
| Digest | Batch daily/weekly notifications for users on digest prefs | read `NotificationPreference`, send summaries |
| Integration sync | Run scheduled connector syncs | `runSync()` per scheduled integration |

## 5. Live adapters (swap simulated → real)

- **Channels** (`src/lib/notify.ts`) — replace `deliver()` with Firebase/APNs (push), Twilio (SMS), Postmark/SES/Resend (email).
- **GPS/Maps** — feed `VehiclePosition` from telematics/driver GPS; use the Google Maps connector for geocoding + traffic-aware ETA.
- **Connectors** (`src/lib/sync.ts`) — implement per-vendor REST/SFTP clients; add OAuth for Google/Microsoft SSO.
- **AI** — set `OPENAI_API_KEY`; add PDF/Word extraction + a vector index for retrieval.

## 6. Reliability

- **Backups**: enable automated Postgres snapshots (point-in-time recovery). Test restores quarterly.
- **Disaster recovery**: cross-region snapshot copy; documented RTO/RPO; restore runbook.
- **High availability**: run ≥2 stateless app instances behind a load balancer; managed HA Postgres. Sessions are stateless JWTs, so any instance can serve any request. For multi-instance rate limiting, back `src/lib/ratelimit.ts` with Redis.
- **Monitoring**: `GET /api/health` (liveness/DB). Add uptime checks, APM (OpenTelemetry), log aggregation, and error alerting (Sentry).
- **Offline capability**: the driver and teacher-trip actions are single POSTs — the mobile clients should queue them locally and retry on reconnect (idempotent boarding/consent upserts make this safe).

## 7. Security operations

See `SECURITY.md` for the full control list: MFA, session revocation, rate
limiting, security headers, audit + safeguarding logging, penetration-test and
vulnerability-management cadence.
