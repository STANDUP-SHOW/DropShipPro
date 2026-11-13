-- Avis relevés chez le fournisseur (13/11/2026) : la mention affichée dessous
-- sur les boutiques. Additive : une colonne neuve avec sa valeur par défaut.
ALTER TABLE "User" ADD COLUMN "avisFournisseurMention" TEXT NOT NULL DEFAULT 'generique';
