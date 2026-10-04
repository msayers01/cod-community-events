-- AlterEnum
ALTER TYPE "ReadingStatus" ADD VALUE 'PROCESSING';

-- AlterTable
ALTER TABLE "screenshot_reading" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startedAt" TIMESTAMP(3);

