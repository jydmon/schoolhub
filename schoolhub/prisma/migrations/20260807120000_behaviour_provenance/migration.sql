-- Behaviour ingestion provenance (Phase 16) — ADDITIVE. No drops/renames.
ALTER TABLE "RewardRecord" ADD COLUMN "externalId" TEXT;
ALTER TABLE "RewardRecord" ADD COLUMN "integrationId" TEXT;
-- Idempotency: one record per (school, source, externalId). Postgres allows
-- multiple NULL externalId rows, so manually-entered rewards are unaffected.
CREATE UNIQUE INDEX "RewardRecord_schoolId_source_externalId_key" ON "RewardRecord"("schoolId","source","externalId");
