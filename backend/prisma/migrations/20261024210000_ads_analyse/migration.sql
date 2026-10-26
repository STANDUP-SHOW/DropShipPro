-- AdsAnalyser (DESKTOP POWER, 24/10/2026). Additive : une table neuve, rien d'autre ne change.
CREATE TABLE "AdsAnalyse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plateforme" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "produit" TEXT,
    "body" TEXT NOT NULL,
    "donnees" JSONB,
    "drops" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdsAnalyse_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdsAnalyse_userId_createdAt_idx" ON "AdsAnalyse"("userId", "createdAt");

ALTER TABLE "AdsAnalyse" ADD CONSTRAINT "AdsAnalyse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
