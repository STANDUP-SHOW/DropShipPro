-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "supplierCheckedAt" TIMESTAMP(3),
ADD COLUMN     "supplierId" TEXT,
ADD COLUMN     "supplierPrice" DECIMAL(10,2),
ADD COLUMN     "supplierRef" TEXT,
ADD COLUMN     "supplierStock" INTEGER;
