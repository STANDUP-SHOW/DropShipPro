-- Agent de controle de l AUTO-SHIPPER, facture a l annonce (14/10/2026).
-- Colonne avec defaut : additif, aucune donnee existante touchee.
ALTER TABLE "Autopilot" ADD COLUMN "controleAgent" BOOLEAN NOT NULL DEFAULT false;
