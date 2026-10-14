-- Produits repris par rayon, rayon par rayon (14/10/2026).
-- Colonne nullable : additif, aucune donnee existante touchee.
ALTER TABLE "Autopilot" ADD COLUMN "produitsRayons" JSONB;
