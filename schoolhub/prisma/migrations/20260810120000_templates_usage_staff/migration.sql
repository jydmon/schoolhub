-- Phase 17b — templates, usage analytics, SIPlat staff RBAC, subscription
-- approval fields. ADDITIVE.

-- Approval workflow columns on existing subscription tables.
ALTER TABLE "Subscription" ADD COLUMN "approvalMode" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "Subscription" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE "Subscription" ADD COLUMN "approvedByUserId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
ALTER TABLE "ParentSubscription" ADD COLUMN "approvalMode" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "ParentSubscription" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE "ParentSubscription" ADD COLUMN "approvedByUserId" TEXT;
ALTER TABLE "ParentSubscription" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "ParentSubscription" ADD COLUMN "reminderSentAt" TIMESTAMP(3);

CREATE TABLE "MessageTemplate" (
  "id" TEXT PRIMARY KEY,
  "scope" TEXT NOT NULL DEFAULT 'platform',
  "schoolId" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'email_campaign',
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "audience" TEXT,
  "subject" TEXT,
  "body" TEXT NOT NULL DEFAULT '',
  "channelsJson" TEXT NOT NULL DEFAULT '[]',
  "sharedWithTenants" BOOLEAN NOT NULL DEFAULT false,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MessageTemplate_scope_idx" ON "MessageTemplate"("scope");
CREATE INDEX "MessageTemplate_schoolId_idx" ON "MessageTemplate"("schoolId");
CREATE INDEX "MessageTemplate_kind_idx" ON "MessageTemplate"("kind");

CREATE TABLE "UsageEvent" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "schoolId" TEXT,
  "role" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "area" TEXT,
  "count" INTEGER NOT NULL DEFAULT 1,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "UsageEvent_userId_idx" ON "UsageEvent"("userId");
CREATE INDEX "UsageEvent_schoolId_idx" ON "UsageEvent"("schoolId");
CREATE INDEX "UsageEvent_role_idx" ON "UsageEvent"("role");
CREATE INDEX "UsageEvent_action_idx" ON "UsageEvent"("action");
CREATE INDEX "UsageEvent_at_idx" ON "UsageEvent"("at");

CREATE TABLE "PlatformRole" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "areasJson" TEXT NOT NULL DEFAULT '[]',
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PlatformRole_key_key" ON "PlatformRole"("key");

CREATE TABLE "PlatformStaff" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "roleKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "invitedById" TEXT,
  "lastActiveAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformStaff_roleKey_fkey" FOREIGN KEY ("roleKey") REFERENCES "PlatformRole"("key")
);
CREATE UNIQUE INDEX "PlatformStaff_userId_key" ON "PlatformStaff"("userId");
CREATE INDEX "PlatformStaff_roleKey_idx" ON "PlatformStaff"("roleKey");
CREATE INDEX "PlatformStaff_status_idx" ON "PlatformStaff"("status");
