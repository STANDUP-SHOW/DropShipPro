-- DropShop IA : la boutique écrite par le modèle, ses versions, et le paiement
-- en ligne des commandes de vitrine. Tout est additif : rien d'existant n'est
-- touché, aucune ligne n'est modifiée.
--
-- Rappel qui a coûté cher le 01/09/2026 : cette migration s'applique avec
-- `prisma migrate deploy`, jamais avec une commande qui prend une base fantôme.

ALTER TABLE "Shop"
  ADD COLUMN "siteHtml"            TEXT,
  ADD COLUMN "siteBrief"           TEXT,
  ADD COLUMN "siteVersion"         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "siteModifsRestantes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "siteJob"             JSONB,
  ADD COLUMN "stripeSecretKey"     TEXT;

ALTER TABLE "Order"
  ADD COLUMN "paidAt"          TIMESTAMP(3),
  ADD COLUMN "stripeSessionId" TEXT;

CREATE TABLE "SiteVersion" (
  "id"        TEXT NOT NULL,
  "shopId"    TEXT NOT NULL,
  "numero"    INTEGER NOT NULL,
  "html"      TEXT NOT NULL,
  "demande"   TEXT NOT NULL,
  "modele"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteVersion_shopId_numero_key" ON "SiteVersion"("shopId", "numero");

ALTER TABLE "SiteVersion"
  ADD CONSTRAINT "SiteVersion_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
