-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "marketAnalysis" JSONB,
ADD COLUMN     "marketAnalysedAt" TIMESTAMP(3);
