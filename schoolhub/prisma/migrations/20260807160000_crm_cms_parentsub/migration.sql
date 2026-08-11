-- Phase 17 — CRM, campaigns, website capture, CMS videos, parent subscriptions,
-- multi-driver route assignment. ADDITIVE (no changes to existing tables except
-- the RouteDriver FK back-relation, which needs no column change on Route).

CREATE TABLE "CrmContact" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "phone" TEXT,
  "audience" TEXT NOT NULL DEFAULT 'subscriber',
  "source" TEXT NOT NULL DEFAULT 'website',
  "interest" TEXT,
  "tagsJson" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'subscribed',
  "consent" BOOLEAN NOT NULL DEFAULT false,
  "optInAt" TIMESTAMP(3),
  "unsubToken" TEXT,
  "lastCampaignAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CrmContact_email_schoolId_key" ON "CrmContact"("email", "schoolId");
CREATE UNIQUE INDEX "CrmContact_unsubToken_key" ON "CrmContact"("unsubToken");
CREATE INDEX "CrmContact_schoolId_idx" ON "CrmContact"("schoolId");
CREATE INDEX "CrmContact_audience_idx" ON "CrmContact"("audience");
CREATE INDEX "CrmContact_status_idx" ON "CrmContact"("status");

CREATE TABLE "CrmSegment" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "filterJson" TEXT NOT NULL DEFAULT '{}',
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CrmSegment_schoolId_idx" ON "CrmSegment"("schoolId");

CREATE TABLE "Campaign" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "fromName" TEXT NOT NULL DEFAULT 'SIPlat',
  "fromEmail" TEXT NOT NULL DEFAULT 'hello@siplat.co',
  "segmentId" TEXT,
  "audienceJson" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "scheduledFor" TIMESTAMP(3),
  "totalRecipients" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "openCount" INTEGER NOT NULL DEFAULT 0,
  "clickCount" INTEGER NOT NULL DEFAULT 0,
  "unsubCount" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3)
);
CREATE INDEX "Campaign_schoolId_idx" ON "Campaign"("schoolId");
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

CREATE TABLE "CampaignRecipient" (
  "id" TEXT PRIMARY KEY,
  "campaignId" TEXT NOT NULL,
  "contactId" TEXT,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "clickedAt" TIMESTAMP(3),
  CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_email_key" ON "CampaignRecipient"("campaignId", "email");
CREATE INDEX "CampaignRecipient_campaignId_idx" ON "CampaignRecipient"("campaignId");
CREATE INDEX "CampaignRecipient_status_idx" ON "CampaignRecipient"("status");

CREATE TABLE "HelpVideo" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL DEFAULT 'getting_started',
  "audience" TEXT NOT NULL DEFAULT 'all',
  "url" TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "durationSec" INTEGER NOT NULL DEFAULT 0,
  "transcript" TEXT,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "views" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HelpVideo_schoolId_idx" ON "HelpVideo"("schoolId");
CREATE INDEX "HelpVideo_category_idx" ON "HelpVideo"("category");
CREATE INDEX "HelpVideo_published_idx" ON "HelpVideo"("published");

CREATE TABLE "ParentSubscription" (
  "id" TEXT PRIMARY KEY,
  "parentUserId" TEXT NOT NULL,
  "schoolId" TEXT,
  "planKey" TEXT NOT NULL DEFAULT 'parent_premium',
  "status" TEXT NOT NULL DEFAULT 'trialing',
  "amountMinor" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "interval" TEXT NOT NULL DEFAULT 'month',
  "stripeCustomerRef" TEXT,
  "stripeSubRef" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "renewalDate" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ParentSubscription_parentUserId_planKey_key" ON "ParentSubscription"("parentUserId", "planKey");
CREATE INDEX "ParentSubscription_status_idx" ON "ParentSubscription"("status");
CREATE INDEX "ParentSubscription_schoolId_idx" ON "ParentSubscription"("schoolId");

CREATE TABLE "RouteDriver" (
  "id" TEXT PRIMARY KEY,
  "routeId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "driverUserId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'primary',
  "session" TEXT NOT NULL DEFAULT 'all',
  "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activeUntil" TIMESTAMP(3),
  "assignedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RouteDriver_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "RouteDriver_routeId_driverUserId_session_key" ON "RouteDriver"("routeId", "driverUserId", "session");
CREATE INDEX "RouteDriver_routeId_idx" ON "RouteDriver"("routeId");
CREATE INDEX "RouteDriver_driverUserId_idx" ON "RouteDriver"("driverUserId");
CREATE INDEX "RouteDriver_schoolId_idx" ON "RouteDriver"("schoolId");
