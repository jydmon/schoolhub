-- Integration Hub (Phase 16) — ADDITIVE migration. No drops, no renames: existing
-- data and functionality are untouched. Postgres dialect (production target).
-- Dev uses SQLite via `prisma db push`; run `prisma migrate deploy` in production.

-- 1) Extend Integration with framework fields (all nullable / defaulted → safe).
ALTER TABLE "Integration" ADD COLUMN "provider" TEXT;
ALTER TABLE "Integration" ADD COLUMN "connectionType" TEXT;
ALTER TABLE "Integration" ADD COLUMN "authMethod" TEXT;
ALTER TABLE "Integration" ADD COLUMN "supportedObjects" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Integration" ADD COLUMN "supportedOperations" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Integration" ADD COLUMN "syncFrequency" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Integration" ADD COLUMN "lastFailedAt" TIMESTAMP(3);
ALTER TABLE "Integration" ADD COLUMN "errorStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Integration" ADD COLUMN "approved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Integration" ADD COLUMN "autoMerge" BOOLEAN NOT NULL DEFAULT false;

-- 2) Encrypted credential vault (1:1 with Integration).
CREATE TABLE "IntegrationCredential" (
  "id" TEXT PRIMARY KEY,
  "integrationId" TEXT NOT NULL UNIQUE,
  "schoolId" TEXT NOT NULL,
  "authMethod" TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "maskedHint" TEXT NOT NULL DEFAULT '',
  "expiresAt" TIMESTAMP(3),
  "rotatedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationCredential_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE,
  CONSTRAINT "IntegrationCredential_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE
);
CREATE INDEX "IntegrationCredential_schoolId_idx" ON "IntegrationCredential"("schoolId");

-- 3) Error-management centre.
CREATE TABLE "IntegrationError" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "integrationId" TEXT,
  "category" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "technical" TEXT,
  "affectedObject" TEXT,
  "externalRecordId" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'open',
  "suggestedAction" TEXT,
  "assignedToId" TEXT,
  "resolutionNotes" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationError_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
  CONSTRAINT "IntegrationError_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL
);
CREATE INDEX "IntegrationError_schoolId_idx" ON "IntegrationError"("schoolId");
CREATE INDEX "IntegrationError_integrationId_idx" ON "IntegrationError"("integrationId");
CREATE INDEX "IntegrationError_status_idx" ON "IntegrationError"("status");

-- 4) Conflict review queue.
CREATE TABLE "SyncConflict" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "integrationId" TEXT,
  "objectType" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "schoolhubValue" TEXT,
  "externalValue" TEXT,
  "sourceSystem" TEXT,
  "externalUpdatedAt" TIMESTAMP(3),
  "recommended" TEXT,
  "resolution" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SyncConflict_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
  CONSTRAINT "SyncConflict_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL
);
CREATE INDEX "SyncConflict_schoolId_idx" ON "SyncConflict"("schoolId");
CREATE INDEX "SyncConflict_status_idx" ON "SyncConflict"("status");

-- 5) Duplicate review queue.
CREATE TABLE "DuplicateCandidate" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "integrationId" TEXT,
  "objectType" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "signals" TEXT NOT NULL DEFAULT '[]',
  "schoolhubId" TEXT,
  "externalId" TEXT,
  "classification" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DuplicateCandidate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
  CONSTRAINT "DuplicateCandidate_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL
);
CREATE INDEX "DuplicateCandidate_schoolId_idx" ON "DuplicateCandidate"("schoolId");
CREATE INDEX "DuplicateCandidate_status_idx" ON "DuplicateCandidate"("status");

-- 6) Per-record provenance links.
CREATE TABLE "ExternalRecordLink" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "integrationId" TEXT,
  "sourceSystem" TEXT NOT NULL,
  "objectType" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "schoolhubId" TEXT,
  "syncStatus" TEXT NOT NULL DEFAULT 'synced',
  "ownership" TEXT NOT NULL DEFAULT 'external',
  "externalModifiedAt" TIMESTAMP(3),
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalRecordLink_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
  CONSTRAINT "ExternalRecordLink_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "ExternalRecordLink_schoolId_sourceSystem_objectType_externalId_key" ON "ExternalRecordLink"("schoolId","sourceSystem","objectType","externalId");
CREATE INDEX "ExternalRecordLink_schoolId_idx" ON "ExternalRecordLink"("schoolId");
CREATE INDEX "ExternalRecordLink_integrationId_idx" ON "ExternalRecordLink"("integrationId");

-- 7) Webhook delivery log (idempotency).
CREATE TABLE "WebhookDelivery" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "eventId" TEXT,
  "eventType" TEXT,
  "signatureValid" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'received',
  "payloadHash" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookDelivery_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
  CONSTRAINT "WebhookDelivery_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "WebhookDelivery_integrationId_eventId_key" ON "WebhookDelivery"("integrationId","eventId");
CREATE INDEX "WebhookDelivery_schoolId_idx" ON "WebhookDelivery"("schoolId");
CREATE INDEX "WebhookDelivery_integrationId_idx" ON "WebhookDelivery"("integrationId");
