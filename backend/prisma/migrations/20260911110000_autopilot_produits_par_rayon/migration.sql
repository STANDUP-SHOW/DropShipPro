-- Nombre de produits gagnants repris par rayon et par passage (1-10).
-- Colonne avec defaut : additif, aucune donnee existante touchee.
ALTER TABLE "Autopilot" ADD COLUMN "produitsParRayon" INTEGER NOT NULL DEFAULT 10;
