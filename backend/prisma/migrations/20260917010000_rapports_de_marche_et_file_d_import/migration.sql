-- Deux tables neuves, additives : rien d'existant n'est touché.
--
-- MarketReport : les rapports quotidiens des 48 agents locaux (MARKET-ANALYSES/),
-- un par jour, catégorie, thème et type. ImportQueue : la file d'import que
-- l'extension Chrome du vendeur vient exécuter (l'agent extension).
--
-- Rappel qui a coûté cher le 01/09/2026 : cette migration s'applique avec
-- `prisma migrate deploy`, jamais avec une commande qui prend une base fantôme.

CREATE TABLE "MarketReport" (
  "id"        TEXT NOT NULL,
  "day"       TEXT NOT NULL,
  "categorie" TEXT NOT NULL,
  "theme"     TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "titre"     TEXT NOT NULL,
  "accroche"  TEXT,
  "body"      TEXT NOT NULL,
  "produits"  JSONB,
  "sources"   INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketReport_day_categorie_theme_type_key" ON "MarketReport"("day", "categorie", "theme", "type");
CREATE INDEX "MarketReport_categorie_day_idx" ON "MarketReport"("categorie", "day");

CREATE TABLE "ImportQueue" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "url"         TEXT NOT NULL,
  "titre"       TEXT,
  "fournisseur" TEXT,
  "mode"        TEXT NOT NULL DEFAULT 'extension',
  "origine"     TEXT,
  "status"      TEXT NOT NULL DEFAULT 'EN_ATTENTE',
  "erreur"      TEXT,
  "productId"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportQueue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportQueue_userId_status_idx" ON "ImportQueue"("userId", "status");

ALTER TABLE "ImportQueue" ADD CONSTRAINT "ImportQueue_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
