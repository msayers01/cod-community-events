-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'RESULT_PENDING', 'VERIFIED', 'DISPUTED', 'UNDER_REVIEW', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'VERIFIED', 'DISPUTED', 'UNCONFIRMED', 'UNDER_REVIEW', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConfirmationResponse" AS ENUM ('CONFIRM', 'DISPUTE');

-- CreateEnum
CREATE TYPE "BadgeKind" AS ENUM ('FOUNDER', 'ADMIN', 'MODERATOR', 'NEW_HOSTER', 'VERIFIED_HOSTER', 'TRUSTED_HOSTER', 'FOUNDING_HOSTER', 'VERIFIED_PLAYER', 'SUPPORTER');

-- CreateEnum
CREATE TYPE "BadgeSource" AS ENUM ('AUTOMATIC', 'GRANTED');

-- CreateEnum
CREATE TYPE "BlacklistStatus" AS ENUM ('PROPOSED', 'AWAITING_SECOND_APPROVAL', 'ACTIVE', 'EXPIRED', 'REMOVED');

-- CreateEnum
CREATE TYPE "AppealTarget" AS ENUM ('BLACKLIST_ENTRY', 'SANCTION', 'DISPUTE_RULING');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'UPHELD', 'OVERTURNED');

-- CreateTable
CREATE TABLE "match" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "teamAId" TEXT NOT NULL,
    "teamBId" TEXT NOT NULL,
    "maps" JSONB NOT NULL DEFAULT '[]',
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "winningTeamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_submission" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "screenshotUrl" TEXT,
    "screenshotKey" TEXT,
    "scoreA" INTEGER NOT NULL,
    "scoreB" INTEGER NOT NULL,
    "winningTeamId" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "verificationDeadline" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_match_stat" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "kills" INTEGER NOT NULL,
    "deaths" INTEGER NOT NULL,
    "plants" INTEGER,
    "defuses" INTEGER,
    "hillTimeSeconds" INTEGER,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "player_match_stat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "confirmation" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "response" "ConfirmationResponse" NOT NULL,
    "disputeReason" TEXT,
    "correctedValues" JSONB,
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "confirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_resolution" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "resolvedById" TEXT NOT NULL,
    "outcome" "SubmissionStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_resolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teammate_rating" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "ratedId" TEXT NOT NULL,
    "wouldPlayAgain" BOOLEAN NOT NULL,
    "communication" INTEGER NOT NULL,
    "effort" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teammate_rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hoster_review" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "organization" INTEGER NOT NULL,
    "communication" INTEGER NOT NULL,
    "fairness" INTEGER NOT NULL,
    "comment" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hoster_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_badge" (
    "userId" TEXT NOT NULL,
    "badge" "BadgeKind" NOT NULL,
    "source" "BadgeSource" NOT NULL DEFAULT 'AUTOMATIC',
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_badge_pkey" PRIMARY KEY ("userId","badge")
);

-- CreateTable
CREATE TABLE "reputation_summary" (
    "userId" TEXT NOT NULL,
    "eventsPlayed" INTEGER NOT NULL DEFAULT 0,
    "eventsHosted" INTEGER NOT NULL DEFAULT 0,
    "confirmedPayouts" INTEGER NOT NULL DEFAULT 0,
    "deniedPayouts" INTEGER NOT NULL DEFAULT 0,
    "noShows" INTEGER NOT NULL DEFAULT 0,
    "verifiedMatches" INTEGER NOT NULL DEFAULT 0,
    "verifiedWins" INTEGER NOT NULL DEFAULT 0,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "plants" INTEGER NOT NULL DEFAULT 0,
    "defuses" INTEGER NOT NULL DEFAULT 0,
    "hillTimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "wouldPlayAgainPct" DOUBLE PRECISION,
    "communicationAvg" DOUBLE PRECISION,
    "effortAvg" DOUBLE PRECISION,
    "confirmationsAsked" INTEGER NOT NULL DEFAULT 0,
    "confirmationsAnswered" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "organizationAvg" DOUBLE PRECISION,
    "hosterCommunicationAvg" DOUBLE PRECISION,
    "fairnessAvg" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reputation_summary_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "blacklist_entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "ReportCategory" NOT NULL,
    "publicWording" TEXT NOT NULL,
    "reportId" TEXT,
    "status" "BlacklistStatus" NOT NULL DEFAULT 'PROPOSED',
    "proposedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "removedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blacklist_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blacklist_approval" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blacklist_approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeal" (
    "id" TEXT NOT NULL,
    "appellantId" TEXT NOT NULL,
    "target" "AppealTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "status" "AppealStatus" NOT NULL DEFAULT 'SUBMITTED',
    "handledById" TEXT,
    "decisionReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_roundId_idx" ON "match"("roundId");

-- CreateIndex
CREATE INDEX "result_submission_matchId_idx" ON "result_submission"("matchId");

-- CreateIndex
CREATE INDEX "result_submission_status_verificationDeadline_idx" ON "result_submission"("status", "verificationDeadline");

-- CreateIndex
CREATE INDEX "player_match_stat_playerId_verified_idx" ON "player_match_stat"("playerId", "verified");

-- CreateIndex
CREATE UNIQUE INDEX "player_match_stat_submissionId_playerId_key" ON "player_match_stat"("submissionId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "confirmation_submissionId_playerId_key" ON "confirmation"("submissionId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "dispute_resolution_submissionId_key" ON "dispute_resolution"("submissionId");

-- CreateIndex
CREATE INDEX "teammate_rating_ratedId_idx" ON "teammate_rating"("ratedId");

-- CreateIndex
CREATE UNIQUE INDEX "teammate_rating_matchId_raterId_ratedId_key" ON "teammate_rating"("matchId", "raterId", "ratedId");

-- CreateIndex
CREATE UNIQUE INDEX "hoster_review_eventId_reviewerId_key" ON "hoster_review"("eventId", "reviewerId");

-- CreateIndex
CREATE INDEX "blacklist_entry_userId_status_idx" ON "blacklist_entry"("userId", "status");

-- CreateIndex
CREATE INDEX "blacklist_entry_status_expiresAt_idx" ON "blacklist_entry"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "blacklist_approval_entryId_staffUserId_key" ON "blacklist_approval"("entryId", "staffUserId");

-- CreateIndex
CREATE INDEX "appeal_status_idx" ON "appeal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "appeal_appellantId_target_targetId_key" ON "appeal"("appellantId", "target", "targetId");

-- AddForeignKey
ALTER TABLE "match" ADD CONSTRAINT "match_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match" ADD CONSTRAINT "match_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "round_team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match" ADD CONSTRAINT "match_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "round_team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match" ADD CONSTRAINT "match_winningTeamId_fkey" FOREIGN KEY ("winningTeamId") REFERENCES "round_team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_submission" ADD CONSTRAINT "result_submission_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_submission" ADD CONSTRAINT "result_submission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_match_stat" ADD CONSTRAINT "player_match_stat_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_match_stat" ADD CONSTRAINT "player_match_stat_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "result_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_match_stat" ADD CONSTRAINT "player_match_stat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confirmation" ADD CONSTRAINT "confirmation_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "result_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confirmation" ADD CONSTRAINT "confirmation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_resolution" ADD CONSTRAINT "dispute_resolution_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "result_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_resolution" ADD CONSTRAINT "dispute_resolution_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teammate_rating" ADD CONSTRAINT "teammate_rating_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teammate_rating" ADD CONSTRAINT "teammate_rating_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teammate_rating" ADD CONSTRAINT "teammate_rating_ratedId_fkey" FOREIGN KEY ("ratedId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hoster_review" ADD CONSTRAINT "hoster_review_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hoster_review" ADD CONSTRAINT "hoster_review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badge" ADD CONSTRAINT "user_badge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reputation_summary" ADD CONSTRAINT "reputation_summary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blacklist_entry" ADD CONSTRAINT "blacklist_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blacklist_entry" ADD CONSTRAINT "blacklist_entry_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blacklist_entry" ADD CONSTRAINT "blacklist_entry_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blacklist_approval" ADD CONSTRAINT "blacklist_approval_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "blacklist_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blacklist_approval" ADD CONSTRAINT "blacklist_approval_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_appellantId_fkey" FOREIGN KEY ("appellantId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
