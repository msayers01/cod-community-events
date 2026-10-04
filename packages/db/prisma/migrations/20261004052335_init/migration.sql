-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'WARNED', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "StaffRoleKind" AS ENUM ('TRIAL_MODERATOR', 'MODERATOR', 'ADMIN', 'FOUNDER');

-- CreateEnum
CREATE TYPE "HosterTier" AS ENUM ('NEW', 'VERIFIED', 'TRUSTED');

-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('SND', 'HARDPOINT');

-- CreateEnum
CREATE TYPE "EventFormat" AS ENUM ('SWITCHEROO', 'STANDARD');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('OPEN', 'REQUIREMENT_BASED', 'INVITE_ONLY');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('PC', 'PLAYSTATION', 'XBOX', 'CROSSPLAY');

-- CreateEnum
CREATE TYPE "Region" AS ENUM ('NA_EAST', 'NA_WEST', 'EU', 'OCE', 'OTHER');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'OPEN', 'CHECK_IN', 'LIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('WAITLISTED', 'CONFIRMED', 'CHECKED_IN', 'IN_POOL', 'NO_SHOW', 'WITHDRAWN', 'REMOVED');

-- CreateEnum
CREATE TYPE "SignupSource" AS ENUM ('WEBSITE', 'JOIN_LINK', 'QUICK_ADD');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "SpinStatus" AS ENUM ('COMMITTED', 'SPUN', 'REVEALED');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('PENDING', 'SPUN', 'IN_PROGRESS', 'COMPLETE');

-- CreateEnum
CREATE TYPE "PayoutResponse" AS ENUM ('PAID', 'NOT_PAID', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('NON_PAYMENT', 'CHEATING', 'THROWING', 'REPEATED_NO_SHOWS', 'HARASSMENT', 'FALSIFIED_RESULTS');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('SUBMITTED', 'GATHERING_EVIDENCE', 'AWAITING_RESPONSE', 'UNDER_REVIEW', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('SCREENSHOT', 'VOD', 'PAYMENT_RECORD', 'OTHER');

-- CreateEnum
CREATE TYPE "SanctionType" AS ENUM ('WARNING', 'SUSPENSION', 'PERMANENT_BAN');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "displayName" TEXT NOT NULL,
    "activisionId" TEXT,
    "streamUrl" TEXT,
    "bio" TEXT NOT NULL DEFAULT '',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "handle" TEXT,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_role" (
    "userId" TEXT NOT NULL,
    "role" "StaffRoleKind" NOT NULL,
    "badgeHidden" BOOLEAN NOT NULL DEFAULT false,
    "grantedById" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_role_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "conflict_declaration" (
    "id" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "conflictedUserId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conflict_declaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hoster_profile" (
    "userId" TEXT NOT NULL,
    "tier" "HosterTier" NOT NULL DEFAULT 'NEW',
    "tierSetManually" BOOLEAN NOT NULL DEFAULT false,
    "foundingHoster" BOOLEAN NOT NULL DEFAULT false,
    "twitterHandle" TEXT,
    "discordInvite" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hoster_profile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "event_template" (
    "id" TEXT NOT NULL,
    "hosterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event" (
    "id" TEXT NOT NULL,
    "hosterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "mode" "GameMode" NOT NULL,
    "format" "EventFormat" NOT NULL,
    "teamSize" INTEGER NOT NULL,
    "roundCount" INTEGER,
    "playerCap" INTEGER NOT NULL,
    "entryFeeCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "payoutSplit" JSONB NOT NULL,
    "region" "Region" NOT NULL,
    "platform" "Platform" NOT NULL,
    "rules" JSONB NOT NULL,
    "entryType" "EntryType" NOT NULL DEFAULT 'OPEN',
    "entryRequirements" JSONB,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "checkInOpensAt" TIMESTAMP(3) NOT NULL,
    "checkInClosesAt" TIMESTAMP(3) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "joinCode" TEXT NOT NULL,
    "overlayKey" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'WAITLISTED',
    "source" "SignupSource" NOT NULL DEFAULT 'WEBSITE',
    "waitlistPosition" INTEGER,
    "markedPaidById" TEXT,
    "markedPaidAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "removedReason" TEXT,
    "blacklistFlagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_invite" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "event_invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spin" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "pool" JSONB NOT NULL,
    "poolHash" TEXT NOT NULL,
    "commitment" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "revealedSecret" TEXT,
    "result" JSONB,
    "status" "SpinStatus" NOT NULL DEFAULT 'COMMITTED',
    "triggeredById" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spunAt" TIMESTAMP(3),
    "revealedAt" TIMESTAMP(3),

    CONSTRAINT "spin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "status" "RoundStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_team" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "round_team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_team_member" (
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "round_team_member_pkey" PRIMARY KEY ("teamId","userId")
);

-- CreateTable
CREATE TABLE "payout_confirmation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "winnerId" TEXT NOT NULL,
    "place" INTEGER NOT NULL,
    "response" "PayoutResponse" NOT NULL DEFAULT 'NO_RESPONSE',
    "deadline" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_confirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "eventId" TEXT,
    "matchId" TEXT,
    "category" "ReportCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'SUBMITTED',
    "assignedStaffId" TEXT,
    "accusedResponse" TEXT,
    "respondedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "url" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "submittedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SanctionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "reportId" TEXT,
    "issuedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sanction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_note" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_action_log" (
    "id" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_action_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discord_server_config" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "configuredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discord_server_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_displayName_key" ON "user"("displayName");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_userId_key" ON "account"("providerId", "userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "conflict_declaration_staffUserId_conflictedUserId_key" ON "conflict_declaration"("staffUserId", "conflictedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "event_template_hosterId_name_key" ON "event_template"("hosterId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "event_slug_key" ON "event"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "event_joinCode_key" ON "event"("joinCode");

-- CreateIndex
CREATE UNIQUE INDEX "event_overlayKey_key" ON "event"("overlayKey");

-- CreateIndex
CREATE INDEX "event_status_startsAt_idx" ON "event"("status", "startsAt");

-- CreateIndex
CREATE INDEX "event_hosterId_idx" ON "event"("hosterId");

-- CreateIndex
CREATE INDEX "registration_eventId_status_idx" ON "registration"("eventId", "status");

-- CreateIndex
CREATE INDEX "registration_playerId_idx" ON "registration"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "registration_eventId_playerId_key" ON "registration"("eventId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "event_invite_eventId_invitedUserId_key" ON "event_invite"("eventId", "invitedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "spin_roundId_key" ON "spin"("roundId");

-- CreateIndex
CREATE INDEX "spin_eventId_idx" ON "spin"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "round_eventId_roundNumber_key" ON "round"("eventId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "round_team_roundId_label_key" ON "round_team"("roundId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "payout_confirmation_eventId_winnerId_key" ON "payout_confirmation"("eventId", "winnerId");

-- CreateIndex
CREATE INDEX "report_reportedUserId_idx" ON "report"("reportedUserId");

-- CreateIndex
CREATE INDEX "report_status_idx" ON "report"("status");

-- CreateIndex
CREATE INDEX "sanction_userId_idx" ON "sanction"("userId");

-- CreateIndex
CREATE INDEX "staff_note_userId_idx" ON "staff_note"("userId");

-- CreateIndex
CREATE INDEX "staff_action_log_targetType_targetId_idx" ON "staff_action_log"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "staff_action_log_staffUserId_idx" ON "staff_action_log"("staffUserId");

-- CreateIndex
CREATE INDEX "notification_userId_readAt_idx" ON "notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "outbox_event_status_createdAt_idx" ON "outbox_event"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "discord_server_config_guildId_channelId_key" ON "discord_server_config"("guildId", "channelId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_role" ADD CONSTRAINT "staff_role_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_declaration" ADD CONSTRAINT "conflict_declaration_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_declaration" ADD CONSTRAINT "conflict_declaration_conflictedUserId_fkey" FOREIGN KEY ("conflictedUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hoster_profile" ADD CONSTRAINT "hoster_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_template" ADD CONSTRAINT "event_template_hosterId_fkey" FOREIGN KEY ("hosterId") REFERENCES "hoster_profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_hosterId_fkey" FOREIGN KEY ("hosterId") REFERENCES "hoster_profile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration" ADD CONSTRAINT "registration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration" ADD CONSTRAINT "registration_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration" ADD CONSTRAINT "registration_markedPaidById_fkey" FOREIGN KEY ("markedPaidById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_invite" ADD CONSTRAINT "event_invite_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_invite" ADD CONSTRAINT "event_invite_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spin" ADD CONSTRAINT "spin_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spin" ADD CONSTRAINT "spin_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spin" ADD CONSTRAINT "spin_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round" ADD CONSTRAINT "round_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_team" ADD CONSTRAINT "round_team_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_team_member" ADD CONSTRAINT "round_team_member_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "round_team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_team_member" ADD CONSTRAINT "round_team_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_confirmation" ADD CONSTRAINT "payout_confirmation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_confirmation" ADD CONSTRAINT "payout_confirmation_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanction" ADD CONSTRAINT "sanction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanction" ADD CONSTRAINT "sanction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanction" ADD CONSTRAINT "sanction_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_note" ADD CONSTRAINT "staff_note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_note" ADD CONSTRAINT "staff_note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_action_log" ADD CONSTRAINT "staff_action_log_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discord_server_config" ADD CONSTRAINT "discord_server_config_configuredById_fkey" FOREIGN KEY ("configuredById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────── Append-only staff action log ─────────────
-- Enforced in the database so accountability does not depend on application code.
CREATE OR REPLACE FUNCTION staff_action_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'staff_action_log is append-only (% not allowed)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER staff_action_log_no_update
  BEFORE UPDATE OR DELETE ON "staff_action_log"
  FOR EACH ROW EXECUTE FUNCTION staff_action_log_immutable();

CREATE TRIGGER staff_action_log_no_truncate
  BEFORE TRUNCATE ON "staff_action_log"
  FOR EACH STATEMENT EXECUTE FUNCTION staff_action_log_immutable();
