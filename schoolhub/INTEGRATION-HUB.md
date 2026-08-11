# SchoolHub Integration Hub — framework, setup & security

The Integration Hub is a reusable, multi-tenant connector + synchronisation
framework. It is **not** wired into individual modules: schools connect external
systems through a central catalog, credential vault, mapping/transform layer,
sync engine, and error/conflict/duplicate queues. Everything is scoped to one
school tenant.

This document covers the framework, setup, environment, security model, testing,
and known limitations. It builds on the existing integrations subsystem
(`Integration`, `FieldMapping`, `SyncRun`, `SourceOfTruth`, `ImportBatch`) —
nothing there was removed or renamed.

## Architecture

```
Marketplace (HUB_CATALOG)  →  Connector instance (Integration row)
        │                              │
        │                       Credential vault (IntegrationCredential, AES-256-GCM)
        │                              │
  Config wizard  →  Field mapping (+ transforms) ── AI suggestions (mapping-ai)
        │                              │
        └──────────►  Sync engine  ──► validation ──► persist + provenance (ExternalRecordLink)
                          │                 │                    │
                    SyncRun history    Error queue          Conflict / Duplicate queues
                          │
                    Audit trail (AuditLog)   Webhook deliveries (idempotent, signed)
```

### Key modules (`src/lib/integration/`)
| File | Responsibility |
|---|---|
| `crypto.ts` | AES-256-GCM credential vault, masking, deep redaction, HMAC webhook signatures |
| `catalog.ts` | Connector templates (28) with framework metadata + marketplace search |
| `transforms.ts` | Declarative field transformations (date, boolean, phone, lookup, concat, …) |
| `mapping-ai.ts` | AI-assisted mapping recommendations with confidence scores |
| `validation.ts` | Import validation → Passed / Warning / Failed |
| `dedupe.ts` | Duplicate detection + classification (unambiguous / candidate / distinct) |
| `source-of-truth.ts` | Ownership model + write-back / overwrite enforcement |
| `hub.ts` | DB service layer: credentials, dashboard, end-to-end import, errors |

### Data model (additive — Phase 16 migration)
`Integration` gains `provider, connectionType, authMethod, supportedObjects,
supportedOperations, syncFrequency, lastFailedAt, errorStatus, approved,
autoMerge`. New tables: `IntegrationCredential`, `IntegrationError`,
`SyncConflict`, `DuplicateCandidate`, `ExternalRecordLink`, `WebhookDelivery`.
Migration: `prisma/migrations/20260806090000_integration_hub/migration.sql`
(additive only — no drops/renames). Dev: `npm run db:push`. Prod:
`prisma migrate deploy`.

## Security model
- **Credentials** are AES-256-GCM encrypted before storage (`INTEGRATION_ENC_KEY`,
  32 bytes). Plaintext is never stored, logged, returned, or shown after saving —
  only a masked hint (`••••abcd`). `redact()` scrubs sensitive keys from any
  object before it reaches logs/audit. The dashboard flags the insecure dev key
  fallback.
- **Tenant isolation**: every Hub query filters on `schoolId`; routes call
  `assertTenantAccess` then `assertHubAccess`.
- **RBAC**: new permission `manage_integration_hub`, held by `SchoolAdministrator`
  and the new `IntegrationAdministrator` role; platform super admins may oversee.
- **Webhooks**: optional HMAC-SHA256 signature validation (constant-time), an
  idempotent delivery log (`WebhookDelivery` unique on `integrationId+eventId`),
  and duplicate suppression.
- **Source of truth**: SchoolHub never overwrites externally-owned data unless
  write-back is supported **and** enabled **and** permitted **and** approved
  **and** logged (`canWriteBack`). Sensitive-key redaction + tenant scoping keep
  student addresses / medical / SEND data out of integration logs.

## Setup (connect a system)
1. Open **Integration Hub → Marketplace**, pick a connector.
2. Run the configuration wizard: enter config + credentials (encrypted on save),
   **test connection**, select data objects, choose direction + schedule, map
   fields (AI suggestions available), set source-of-truth rules, preview, confirm.
3. A connector does not activate until the connection test + config validation
   pass. Provider-specific systems (iSAMS, Arbor, Bromcom, SIMS, Veracross) ship
   as **configurable shells** — supply your authorised API credentials/export.

## Environment
- `INTEGRATION_ENC_KEY` — 32-byte hex/base64 key for the credential vault (required in prod).
- `CRON_SECRET` — protects `POST /api/cron/integration-sync` (scheduled runs).

## APIs (tenant-scoped, RBAC + audit)
`/api/schools/{id}/integration-hub/…`: `dashboard`, `catalog`, `credentials`
(POST, encrypted), `test`, `mappings/suggest`, `import` (end-to-end),
`errors` (GET/PATCH), `source-of-truth` (GET/PATCH). Connected-systems CRUD,
field mappings, sync trigger + history reuse the existing
`/api/schools/{id}/integrations/**` routes. Inbound webhooks:
`/api/webhooks/{token}` (signed + idempotent). OpenAPI stub:
`docs/integration-hub.openapi.json`.

## Testing
- **Unit (runnable now):** `tsx tests/integration-hub.test.ts` — 21 tests over
  crypto/masking/redaction, webhook signatures, transforms, AI mapping (incl. the
  spec §10 examples), validation, dedupe, source-of-truth, and the end-to-end
  parse→map→transform→validate pipeline. All pass.
- **Integration/E2E (require a database):** provision Postgres, run the migration,
  then exercise: credential encrypt→store→mask (never returned); tenant-isolation
  (a member of school A cannot read school B's connectors/errors — enforced by
  `assertTenantAccess`); end-to-end CSV/JSON import creating `ExternalRecordLink`
  provenance + error-queue rows; webhook idempotency + signature rejection;
  scheduled-sync concurrency lock. These are specified but not executed in the
  build sandbox (no DB / npm registry).

## Known limitations
- REST/SFTP/OAuth **transports are simulated** in `runSync` (see `src/lib/sync.ts`)
  — provider handshakes are not performed. The working end-to-end path is the
  file/CSV/JSON connector (`runHubImport`). Provider-specific connectors are
  shells until tested against the provider's authorised API.
- AI mapping is a deterministic heuristic (name + value-shape), swappable for an
  LLM behind the same interface.
- Conflict + duplicate **models, libs and queues** exist and are enforced by the
  import path's validation; the conflict/duplicate **review UI + resolution
  endpoints** are scaffolded, not fully wired (see completion report).
- Browser extension and RPA are architecture-only (later phase).

## Behaviour ingestion (rewards & consequences → parent portal) — implemented

A real vertical slice from a connected behaviour system (e.g. ClassCharts) to the
parent portal.

- **Model**: `RewardRecord` gains `externalId` + `integrationId` with a unique
  `(schoolId, source, externalId)` index → **idempotent** re-delivery. Migration:
  `prisma/migrations/20260807120000_behaviour_provenance/migration.sql` (additive).
- **Logic** (`src/lib/integration/behaviour-logic.ts`, pure/tested): `classify`
  (reward vs consequence, mapping arbitrary provider types + point signs to known
  types), `validateEvent`, `normalizeEvent` (magnitude + `positive` flag, stable
  idempotency id), `guardianCanSeeBehaviour` (honours the `behaviour`
  info-restriction), `netPoints`.
- **Ingestion** (`src/lib/integration/behaviour.ts`): `ingestBehaviourEvents`
  matches each event to a pupil (by `externalMisId` or `reference`, tenant-scoped),
  upserts the `RewardRecord` idempotently, writes an `ExternalRecordLink`
  (`objectType: "behaviour"`) for provenance, notifies guardians per their
  behaviour restriction + reward preferences, queues unmatched/invalid events as
  `IntegrationError`, and audits the batch. Rewards are owned by the behaviour
  system in the source-of-truth model, so this is the authoritative inbound update.
- **APIs**: `POST /api/schools/{id}/integration-hub/behaviour/ingest` (staff,
  `manage_integration_hub`) for import/testing; and the public
  `POST /api/webhooks/{token}` now drives the same ingestion for behaviour
  connectors (signed + idempotent), so a real provider webhook flows straight
  through. `GET /api/parent/rewards` now hides behaviour data from guardians who
  have restricted it.
- **Tests**: `tsx tests/behaviour.test.ts` — 10/10 passing (classification,
  validation, normalization/idempotency, guardian visibility, net points).

### Try it (with a database)
```bash
# 1) Connect a behaviour connector in the Integration Hub (method = webhook) to get a token.
# 2) POST events to the webhook (provider fields are mapped flexibly):
curl -X POST "$BASE/api/webhooks/$TOKEN" -H 'content-type: application/json' -d '{
  "events": [
    {"id":"cc-100","pupil_ref":"STU-1001","reward_type":"merit","points":2,"reason":"Teamwork in science","staff":"Mr Reed"},
    {"id":"cc-101","pupil_ref":"STU-1001","reward_type":"detention","points":-1,"reason":"Late homework"}
  ]}'
# → matched to the pupil, stored with provenance, guardians notified;
#   re-POSTing the same ids updates in place (idempotent).
# 3) The linked parent sees them under that child (Behaviour tab / GET /api/parent/rewards).
```
