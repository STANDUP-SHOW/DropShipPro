-- Auto-fulfillment multi-canal (29/09/2026) : etat de la releve des ventes par canal.
-- Ecrite a la main, sans base fantome ; purement additive.
ALTER TABLE "PlatformCredential" ADD COLUMN "ventesReleveesAt" TIMESTAMP(3);
ALTER TABLE "PlatformCredential" ADD COLUMN "ventesErreur" TEXT;
ALTER TABLE "PlatformCredential" ADD COLUMN "ventesBilan" JSONB;
