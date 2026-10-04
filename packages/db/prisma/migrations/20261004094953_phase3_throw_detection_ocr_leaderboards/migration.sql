-- CreateEnum
CREATE TYPE "RandomizationMode" AS ENUM ('RANDOM', 'SKILL_BALANCED', 'NO_REPEAT_TEAMMATES');

-- CreateEnum
CREATE TYPE "StatSource" AS ENUM ('MANUAL', 'OCR');

-- CreateEnum
CREATE TYPE "ReadingStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ThrowSignal" AS ENUM ('PERFORMANCE_DROP', 'EVENT_LOSS_STREAK', 'TEAMMATE_LOSS_PATTERN');

-- CreateEnum
CREATE TYPE "ThrowFlagStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'DISMISSED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "LeaderboardPeriod" AS ENUM ('MONTH', 'SEASON', 'ALL_TIME');

-- AlterTable
ALTER TABLE "event" ADD COLUMN     "randomization" "RandomizationMode" NOT NULL DEFAULT 'RANDOM';

-- AlterTable
ALTER TABLE "player_match_stat" ADD COLUMN     "source" "StatSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "screenshot_reading" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "status" "ReadingStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'tesseract',
    "rawText" TEXT,
    "confidence" DOUBLE PRECISION,
    "rows" JSONB NOT NULL DEFAULT '[]',
    "discrepancies" JSONB NOT NULL DEFAULT '[]',
    "filledStats" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "screenshot_reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "throw_flag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signal" "ThrowSignal" NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "eventId" TEXT,
    "matchId" TEXT,
    "relatedUserId" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "details" JSONB NOT NULL,
    "status" "ThrowFlagStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "throw_flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard_entry" (
    "id" TEXT NOT NULL,
    "period" "LeaderboardPeriod" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "mode" "GameMode" NOT NULL,
    "userId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "matches" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaderboard_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "screenshot_reading_submissionId_key" ON "screenshot_reading"("submissionId");

-- CreateIndex
CREATE INDEX "screenshot_reading_status_idx" ON "screenshot_reading"("status");

-- CreateIndex
CREATE INDEX "throw_flag_status_score_idx" ON "throw_flag"("status", "score");

-- CreateIndex
CREATE INDEX "throw_flag_userId_idx" ON "throw_flag"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "throw_flag_userId_signal_scopeKey_key" ON "throw_flag"("userId", "signal", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "season_name_key" ON "season"("name");

-- CreateIndex
CREATE INDEX "season_startsAt_endsAt_idx" ON "season"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "leaderboard_entry_period_periodKey_mode_rank_idx" ON "leaderboard_entry"("period", "periodKey", "mode", "rank");

-- CreateIndex
CREATE INDEX "leaderboard_entry_userId_idx" ON "leaderboard_entry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_entry_period_periodKey_mode_userId_key" ON "leaderboard_entry"("period", "periodKey", "mode", "userId");

-- AddForeignKey
ALTER TABLE "screenshot_reading" ADD CONSTRAINT "screenshot_reading_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "result_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "throw_flag" ADD CONSTRAINT "throw_flag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "throw_flag" ADD CONSTRAINT "throw_flag_relatedUserId_fkey" FOREIGN KEY ("relatedUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "throw_flag" ADD CONSTRAINT "throw_flag_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season" ADD CONSTRAINT "season_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_entry" ADD CONSTRAINT "leaderboard_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

