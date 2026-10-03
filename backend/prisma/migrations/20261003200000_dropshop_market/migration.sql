-- DropShop Market (03/10/2026) : la place de marché drop-shop.cloud.
-- Écrite à la main, sans base fantôme ; purement additive.
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'DROPSHOP_MARKET';

ALTER TABLE "User" ADD COLUMN "stripeConnectId" TEXT;
ALTER TABLE "User" ADD COLUMN "stripeConnectReady" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "User_stripeConnectId_key" ON "User"("stripeConnectId");

ALTER TABLE "Order" ADD COLUMN "commission" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN "variante" TEXT;
