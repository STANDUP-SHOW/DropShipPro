-- Le nom de domaine du site du vendeur, pour le bouton « Aller sur mon site ».
-- Colonne nullable : additif, aucune donnee existante touchee.
ALTER TABLE "Shop" ADD COLUMN "siteUrl" TEXT;
