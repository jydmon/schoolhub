# Invitations, onboarding & RBAC (Phase 17)

Access to SchoolHub is **invitation-only** — users cannot self-register, and
parents in particular are provisioned only by a school invitation that names
their role and their children.

## Model
- `Invitation` (email, role, `studentRefs`, status, `tokenHash`, `codeHash`,
  `requireMfa`, `expiresAt`). Raw token (activation link) + 6-digit code are
  returned once and **never stored** — only HMAC hashes (`INVITE_SECRET`).
- `LoginEvent` — login history (success/failed/suspended/disabled) for admin audit.
- Migration: `prisma/migrations/20260807140000_invitations_login/migration.sql` (additive).

## Logic (`src/lib/invite-logic.ts`, pure/tested — `tests/invite.test.ts`, 9/9)
`hashToken`/`hashCode` (+ constant-time `verifyHash`), `generateToken`/`generateCode`,
`isExpired`, `canActivate` (accepted/revoked/expired/bad-code/ok), `normalizeRole`
(school-roles only), `roleLinksChildren` (parents only), `defaultExpiry` (7 days).

## Services
- `src/lib/invitations.ts` — `createInvitation`, `resendInvitation`,
  `revokeInvitation`, `acceptInvitation` (verify → create/enable user → grant
  Membership → link GuardianLinks for parents → mark accepted → audit).
- `src/lib/user-admin.ts` — `userAdminAction` (disable/suspend/reactivate/revoke/
  reset_password; all tenant-scoped + audited; disable/suspend/revoke bump
  `sessionVersion` to kill live sessions), `recordLoginEvent`, `listLoginHistory`.

## APIs (tenant-scoped, `manage_users`, audited)
- `POST /api/schools/{id}/invitations` — create (returns token+code to email).
- `GET  /api/schools/{id}/invitations` — list.
- `PATCH /api/schools/{id}/invitations/{invId}` — `{action:"resend"|"revoke"}`.
- `POST /api/invitations/accept` — **public**: `{token, code, fullName, password, acceptTerms:true}` → activates + signs in; returns `requireMfa`.
- `POST /api/schools/{id}/users/{userId}/action` — `{action:"disable"|"suspend"|"reactivate"|"revoke"|"reset_password"}`.
- `GET  /api/schools/{id}/users/{userId}/login-history`.
- `POST /api/auth/login` now records `LoginEvent` and rejects `disabled`/`suspended` (403).

## Onboarding flow (matches the mobile UX)
invite → email link + code → verify → set password (or SSO) → accept Terms →
MFA if required → account linked to school + role (+ children for parents) →
dashboard. Security: invitation tokens, RBAC, tenant isolation, parent–child
verification, session revocation.

## Try it (with a database)
```bash
# create (as an admin session)
curl -X POST "$BASE/api/schools/$SID/invitations" -H 'content-type: application/json' \
  -d '{"email":"newparent@example.com","role":"Parent","studentRefs":["STU-1001"],"requireMfa":true}'
# → { token, code, activationLink }
# accept (public)
curl -X POST "$BASE/api/invitations/accept" -H 'content-type: application/json' \
  -d '{"token":"<token>","code":"<code>","fullName":"New Parent","password":"Password123!","acceptTerms":true}'
# → signed in, linked to STU-1001 only.
```
