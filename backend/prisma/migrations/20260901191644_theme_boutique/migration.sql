-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "storefront" JSONB,
ADD COLUMN     "themeId" TEXT NOT NULL DEFAULT 'comptoir',
ADD COLUMN     "themeTokens" JSONB;
