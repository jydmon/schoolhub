-- Invitations, onboarding & login history (Phase 17) — ADDITIVE.
CREATE TABLE "Invitation" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "studentRefs" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "tokenHash" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "invitedById" TEXT,
  "requireMfa" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invitation_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
CREATE INDEX "Invitation_schoolId_idx" ON "Invitation"("schoolId");
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");
CREATE INDEX "Invitation_status_idx" ON "Invitation"("status");

CREATE TABLE "LoginEvent" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "schoolId" TEXT,
  "ip" TEXT,
  "device" TEXT,
  "result" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LoginEvent_userId_idx" ON "LoginEvent"("userId");
CREATE INDEX "LoginEvent_email_idx" ON "LoginEvent"("email");
CREATE INDEX "LoginEvent_at_idx" ON "LoginEvent"("at");
