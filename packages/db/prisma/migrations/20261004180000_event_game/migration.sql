-- CreateEnum
CREATE TYPE "Game" AS ENUM ('MW3', 'BO6', 'BO7', 'MW4');

-- AlterTable
ALTER TABLE "event" ADD COLUMN     "game" "Game";

