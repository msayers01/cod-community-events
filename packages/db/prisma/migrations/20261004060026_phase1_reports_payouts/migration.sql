-- AlterTable
ALTER TABLE "event" ADD COLUMN     "winnersRecordedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "evidence" ADD COLUMN     "storageKey" TEXT,
ALTER COLUMN "url" DROP NOT NULL;

-- AlterTable
ALTER TABLE "payout_confirmation" ADD COLUMN     "note" TEXT,
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "report" ADD COLUMN     "responseDeadline" TIMESTAMP(3);
