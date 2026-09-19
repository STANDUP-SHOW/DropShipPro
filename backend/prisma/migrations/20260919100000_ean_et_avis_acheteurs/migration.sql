-- Ecrite a la main (regle du projet : jamais de base fantome). Additive seulement.
ALTER TABLE "Product" ADD COLUMN "ean" TEXT;

CREATE TABLE "BuyerReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "author" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "photos" JSONB,
    "source" TEXT NOT NULL,
    "sourceSite" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "published" BOOLEAN NOT NULL DEFAULT true,
    "empreinte" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuyerReview_productId_empreinte_key" ON "BuyerReview"("productId", "empreinte");
CREATE INDEX "BuyerReview_productId_published_idx" ON "BuyerReview"("productId", "published");
CREATE INDEX "BuyerReview_userId_idx" ON "BuyerReview"("userId");

ALTER TABLE "BuyerReview" ADD CONSTRAINT "BuyerReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyerReview" ADD CONSTRAINT "BuyerReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
