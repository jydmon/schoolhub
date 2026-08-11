-- Phase 17c — PII grants, policies, announcements, event updates, email config,
-- support chat, report runs. ADDITIVE.

ALTER TABLE "Trip" ADD COLUMN "updateConfigJson" TEXT NOT NULL DEFAULT '{}';

CREATE TABLE "PiiUnmaskGrant" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "grantedToUserId" TEXT NOT NULL,
  "grantedByUserId" TEXT NOT NULL,
  "scope" TEXT, "reason" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PiiUnmaskGrant_schoolId_idx" ON "PiiUnmaskGrant"("schoolId");
CREATE INDEX "PiiUnmaskGrant_grantedToUserId_idx" ON "PiiUnmaskGrant"("grantedToUserId");

CREATE TABLE "Policy" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "audience" TEXT NOT NULL DEFAULT 'all',
  "version" TEXT NOT NULL DEFAULT '1.0',
  "summary" TEXT, "body" TEXT, "fileUrl" TEXT,
  "requireAck" BOOLEAN NOT NULL DEFAULT false,
  "effectiveDate" TIMESTAMP(3),
  "published" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Policy_schoolId_idx" ON "Policy"("schoolId");
CREATE INDEX "Policy_audience_idx" ON "Policy"("audience");
CREATE INDEX "Policy_published_idx" ON "Policy"("published");

CREATE TABLE "Announcement" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "audienceKind" TEXT NOT NULL DEFAULT 'all',
  "audienceJson" TEXT NOT NULL DEFAULT '{}',
  "channelsJson" TEXT NOT NULL DEFAULT '["inapp"]',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "targetedCount" INTEGER NOT NULL DEFAULT 0,
  "reachedCount" INTEGER NOT NULL DEFAULT 0,
  "perChannelJson" TEXT NOT NULL DEFAULT '{}',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3)
);
CREATE INDEX "Announcement_schoolId_idx" ON "Announcement"("schoolId");
CREATE INDEX "Announcement_status_idx" ON "Announcement"("status");

CREATE TABLE "EventUpdate" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "label" TEXT, "note" TEXT, "byUserId" TEXT,
  "notified" INTEGER NOT NULL DEFAULT 0,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "EventUpdate_schoolId_idx" ON "EventUpdate"("schoolId");
CREATE INDEX "EventUpdate_tripId_idx" ON "EventUpdate"("tripId");

CREATE TABLE "EmailConfig" (
  "id" TEXT PRIMARY KEY,
  "provider" TEXT NOT NULL DEFAULT 'console',
  "fromName" TEXT NOT NULL DEFAULT 'SIPlat',
  "fromEmail" TEXT NOT NULL DEFAULT 'hello@siplat.co',
  "host" TEXT, "port" INTEGER, "username" TEXT, "secretEnc" TEXT,
  "configuredById" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "SupportChat" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "openedById" TEXT, "withUserId" TEXT,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SupportChat_schoolId_idx" ON "SupportChat"("schoolId");
CREATE INDEX "SupportChat_status_idx" ON "SupportChat"("status");

CREATE TABLE "SupportChatMessage" (
  "id" TEXT PRIMARY KEY,
  "chatId" TEXT NOT NULL,
  "senderId" TEXT, "senderRole" TEXT NOT NULL, "body" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "SupportChat"("id") ON DELETE CASCADE
);
CREATE INDEX "SupportChatMessage_chatId_idx" ON "SupportChatMessage"("chatId");

CREATE TABLE "ReportRun" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT,
  "scope" TEXT NOT NULL DEFAULT 'platform',
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "paramsJson" TEXT NOT NULL DEFAULT '{}',
  "format" TEXT NOT NULL DEFAULT 'json',
  "status" TEXT NOT NULL DEFAULT 'ready',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ReportRun_schoolId_idx" ON "ReportRun"("schoolId");
CREATE INDEX "ReportRun_type_idx" ON "ReportRun"("type");
