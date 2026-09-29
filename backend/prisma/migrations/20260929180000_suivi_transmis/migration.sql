-- Auto-fulfillment (29/09/2026) : le suivi renvoye a la place de marche.
-- Ecrite a la main, sans base fantome ; purement additive.
ALTER TABLE "Order" ADD COLUMN "suiviTransmisAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "suiviTransmisErreur" TEXT;
