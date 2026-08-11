-- Phase 17d — policy acknowledgements. ADDITIVE.
CREATE TABLE "PolicyAck" (
  "id" TEXT PRIMARY KEY,
  "policyId" TEXT NOT NULL,
  "schoolId" TEXT,
  "userId" TEXT NOT NULL,
  "role" TEXT,
  "version" TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PolicyAck_policyId_userId_version_key" ON "PolicyAck"("policyId", "userId", "version");
CREATE INDEX "PolicyAck_policyId_idx" ON "PolicyAck"("policyId");
CREATE INDEX "PolicyAck_userId_idx" ON "PolicyAck"("userId");
