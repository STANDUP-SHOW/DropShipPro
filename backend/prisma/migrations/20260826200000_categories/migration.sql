-- Le referentiel de categories, en base parce qu un tableau fige ne peut pas
-- apprendre. L ancien couvrait 29 entrees dont 28 de mode homme.
CREATE TABLE "Category" (
  "id"        TEXT NOT NULL,
  "parentId"  TEXT,
  "sector"    TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "path"      TEXT NOT NULL,
  "google"    TEXT NOT NULL,
  "targets"   JSONB,
  "origin"    TEXT NOT NULL DEFAULT 'core',
  "uses"      INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Category_sector_idx" ON "Category"("sector");
CREATE INDEX "Category_origin_idx" ON "Category"("origin");

ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- La memoire de l apprentissage : ce qu on a deja vu ecrit pour designer une
-- categorie. Sans elle, la meme categorie fournisseur repartirait au modele a
-- chaque import.
CREATE TABLE "CategoryAlias" (
  "id"         TEXT NOT NULL,
  "key"        TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "source"     TEXT NOT NULL DEFAULT 'ia',
  "uses"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CategoryAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CategoryAlias_key_key" ON "CategoryAlias"("key");
CREATE INDEX "CategoryAlias_categoryId_idx" ON "CategoryAlias"("categoryId");

ALTER TABLE "CategoryAlias" ADD CONSTRAINT "CategoryAlias_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
