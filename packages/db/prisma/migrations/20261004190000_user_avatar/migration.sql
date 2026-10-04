-- AlterTable
ALTER TABLE "user" ADD COLUMN     "avatarUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "user_avatar" (
    "userId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'image/webp',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_avatar_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "user_avatar" ADD CONSTRAINT "user_avatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

