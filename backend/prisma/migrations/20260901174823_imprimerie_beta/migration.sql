-- CreateTable
CREATE TABLE "PrintProduct" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'pixartprinting',
    "sourceUrl" TEXT NOT NULL,
    "sourceRef" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "images" JSONB,
    "dimensions" JSONB,
    "priceRows" JSONB,
    "marginPercent" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "shopId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrintProduct_userId_source_idx" ON "PrintProduct"("userId", "source");

-- CreateIndex
CREATE INDEX "PrintProduct_shopId_idx" ON "PrintProduct"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "PrintProduct_userId_sourceUrl_key" ON "PrintProduct"("userId", "sourceUrl");

-- AddForeignKey
ALTER TABLE "PrintProduct" ADD CONSTRAINT "PrintProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintProduct" ADD CONSTRAINT "PrintProduct_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
