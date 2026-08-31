-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "watermarkMode" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "watermarkMode" TEXT NOT NULL DEFAULT 'logo';
