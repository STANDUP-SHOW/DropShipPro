-- Journal des appels IA (28/11/2026). Additive : une table neuve, rien d'autre ne change.
CREATE TABLE "AppelIA" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jour" TEXT NOT NULL,
    "fournisseur" TEXT NOT NULL,
    "modele" TEXT,
    "fonction" TEXT NOT NULL,
    "route" TEXT,
    "userId" TEXT,
    "entree" INTEGER NOT NULL DEFAULT 0,
    "sortie" INTEGER NOT NULL DEFAULT 0,
    "cacheLu" INTEGER NOT NULL DEFAULT 0,
    "cacheEcrit" INTEGER NOT NULL DEFAULT 0,
    "recherches" INTEGER NOT NULL DEFAULT 0,
    "coutUsd" DOUBLE PRECISION,
    "statut" INTEGER NOT NULL,
    "arret" TEXT,
    "dureeMs" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AppelIA_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AppelIA_jour_idx" ON "AppelIA"("jour");
CREATE INDEX "AppelIA_userId_jour_idx" ON "AppelIA"("userId", "jour");
