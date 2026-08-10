-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Platform" ADD VALUE 'WISH';
ALTER TYPE "Platform" ADD VALUE 'LA_REDOUTE';
ALTER TYPE "Platform" ADD VALUE 'LECLERC';
ALTER TYPE "Platform" ADD VALUE 'BHV';
ALTER TYPE "Platform" ADD VALUE 'SPARTOO';
ALTER TYPE "Platform" ADD VALUE 'ATLAS_FOR_MEN';
ALTER TYPE "Platform" ADD VALUE 'KIABI';
ALTER TYPE "Platform" ADD VALUE 'ETSY';
ALTER TYPE "Platform" ADD VALUE 'BRANDALLEY';
ALTER TYPE "Platform" ADD VALUE 'MIINTO';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "attributes" JSONB,
ADD COLUMN     "bulletPoints" JSONB;
