-- Les extensions installées sur les boutiques DropShop (Back Office, paiement
-- en drops…). Additive : une table neuve, rien d'existant n'est touché.
--
-- Rappel qui a coûté cher le 01/09/2026 : cette migration s'applique avec
-- `prisma migrate deploy`, jamais avec une commande qui prend une base fantôme.

CREATE TABLE "ShopExtension" (
  "id"          TEXT NOT NULL,
  "shopId"      TEXT NOT NULL,
  "extensionId" TEXT NOT NULL,
  "config"      JSONB,
  "prixPaye"    INTEGER NOT NULL DEFAULT 0,
  "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShopExtension_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopExtension_shopId_extensionId_key" ON "ShopExtension"("shopId", "extensionId");

ALTER TABLE "ShopExtension"
  ADD CONSTRAINT "ShopExtension_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
