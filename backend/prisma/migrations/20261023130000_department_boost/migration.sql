-- Rayon boost d'AUTO-SHIPPER séparé de l'AUTO-MODE du chef (décision de Max, 23/10/2026).
-- Additive : une colonne avec défaut. Les rayons qui avaient l'AUTO-MODE (levé
-- jusqu'ici par la case boost d'AUTO-SHIPPER) deviennent boost, et leur AUTO-MODE,
-- désormais payant, est baissé : personne ne paie un passage sans l'avoir demandé.
ALTER TABLE "Department" ADD COLUMN "boost" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Department" SET "boost" = true, "autoMode" = false WHERE "autoMode" = true;
