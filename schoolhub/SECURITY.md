# SchoolHub — Security, Privacy & Safeguarding

## Security controls

| Control | Status | Where |
|---------|--------|-------|
| Encryption in transit | HSTS header set; terminate TLS at the edge | `src/middleware.ts`, load balancer |
| Encryption at rest | DB/disk-level (enable on managed Postgres + object storage) | infrastructure |
| Secure password storage | bcrypt (cost 12) | `src/lib/auth.ts` |
| Multi-factor authentication | TOTP (RFC 6238) for any user; expected for privileged roles | `src/lib/mfa.ts`, `/api/auth/mfa` |
| Session management | Stateless JWT in httpOnly/SameSite/Secure cookie; `sessionVersion` supports "sign out everywhere" | `src/lib/session.ts`, `/api/auth/sessions` |
| Device management | Session revocation invalidates all devices; per-device cookies | `/api/auth/sessions` |
| API security | Every route: auth → tenant isolation (`assertTenantAccess`) → RBAC (`assertCan`) | `src/lib/{session,tenant,rbac}.ts` |
| Rate limiting | Per-IP on `/api/auth/*` (middleware) + per-account on login | `src/lib/ratelimit.ts`, `src/middleware.ts` |
| Security headers | X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS | `src/middleware.ts` |
| Security event logging | Login/logout/failed-login, rate-limit hits, permission changes, DSR, safeguarding, emergency — in the audit trail | `src/lib/audit.ts`, `AuditLog` |
| Intrusion monitoring | Failed-login + rate-limit events are auditable; feed to a SIEM | audit export |
| Penetration testing | Process: pre-launch + annual third-party pen test; remediate by severity SLA | operational |
| Vulnerability management | `npm audit` in CI + Dependabot/renovate; patch cadence by CVSS | CI |

## Privacy & compliance

Per-school configuration (`SchoolConfig`, editable in **Operations → Compliance**):

- **Regime**: UK GDPR / DPA, or FERPA for US deployments.
- **Parent consent**: event/trip consent captured and audited.
- **Data retention**: `dataRetentionDays`; enforced by `POST /api/schools/{id}/retention/purge` (audit logs, notifications, AI queries; vehicle positions after 7 days).
- **Data subject requests**: access/export (portable JSON bundle) and erasure (student delete / user anonymise) — `/api/schools/{id}/data-requests` + `/fulfill`.
- **School-specific privacy settings**: restrict medical, restrict SEND, restrict location, child-location privacy.
- **Child location privacy**: parents see approximate location only; precise coordinates are never exposed; location sharing stops when a journey completes.
- **Messaging consent (SMS & WhatsApp)**: WhatsApp is **opt-in** (Meta Business policy) and SMS is **opt-out**, both stored per-user (`whatsappOptIn` / `smsOptOut`) and enforced at send time in `src/lib/notify.ts` — a parent who hasn't opted in to WhatsApp, or has replied STOP, is not messaged on that channel (except genuine emergencies for SMS). Consent changes are audited (`WHATSAPP_OPT_IN` / `WHATSAPP_OPT_OUT` / `SMS_OPT_OUT`), parents self-manage via `/api/parent/messaging` and the Parent app, and inbound STOP/START keywords on `/api/webhooks/whatsapp` update consent automatically. Business-initiated WhatsApp uses pre-approved templates; the webhook verify token and provider signature are environment-configured.

## Safeguarding controls

- **Restricted medical / SEND / location**: redacted for non-senior staff when enabled — `src/lib/safeguarding.ts` (`redactStudent`), applied at the API boundary.
- **Driver access limited to active assignments**: a driver only sees journeys assigned to them, and cannot post position/board once a journey is completed — `src/lib/driver.ts`.
- **Temporary trip access expiration**: hired-coach share links auto-expire (`Trip.coachExpiresAt`; the public endpoint returns 410 after expiry).
- **Emergency escalation**: `POST /api/schools/{id}/emergency` broadcasts a safety-critical alert across all channels, overriding preferences and quiet hours.
- **Safeguarding audit logs**: `SAFEGUARDING` and `EMERGENCY_ALERT` audit actions; DSR fulfilment logged.

## Reliability & offline

- **Notification retry / integration retry**: failed/queued deliveries retried via endpoint/worker; connector syncs retried (`runSync`).
- **Offline driver/teacher capability**: boarding and trip actions are idempotent upserts, so mobile clients can queue offline and replay on reconnect without duplicating records.
- **Backup / DR / HA / monitoring**: see `DEPLOYMENT.md`.

## Incident response

1. Detect (monitoring/alerting, audit anomalies). 2. Contain (rotate `JWT_SECRET` → invalidates all sessions; suspend accounts; bump `sessionVersion`). 3. Eradicate & recover (patch, restore from backup). 4. Notify per regulatory duty (ICO within 72h for UK GDPR where required). 5. Post-incident review.
