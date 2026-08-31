-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN     "meta" JSONB,
ADD COLUMN     "token" TEXT,
ADD COLUMN     "tokenExpires" TIMESTAMP(3);
