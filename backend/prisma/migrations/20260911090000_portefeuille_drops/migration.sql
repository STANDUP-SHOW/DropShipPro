-- Le portefeuille en drops, la monnaie unique (07/09/2026).
--
-- Deux gestes seulement, tous deux additifs et sans risque :
--  1. La table du relevé : une ligne par mouvement de drops (recharge, débit,
--     remboursement), avec le solde après coup.
--  2. Le solde d'inscription passe de 10 à 120 drops.
--
-- La conversion des soldes existants (anciens crédits annonce + crédits images
-- vers des drops) N'EST PAS ici : elle se fait par le script guardé
-- `convertir-en-drops.ts --ecrire`, APRÈS le déploiement du nouveau code, pour
-- ne jamais laisser l'ancien code lire des soldes convertis.

CREATE TABLE "DropTransaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "delta" INTEGER NOT NULL,
  "balance" INTEGER NOT NULL,
  "motif" TEXT NOT NULL,
  "ref" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DropTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DropTransaction_userId_createdAt_idx" ON "DropTransaction"("userId", "createdAt");

ALTER TABLE "DropTransaction" ADD CONSTRAINT "DropTransaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ALTER COLUMN "credits" SET DEFAULT 120;
