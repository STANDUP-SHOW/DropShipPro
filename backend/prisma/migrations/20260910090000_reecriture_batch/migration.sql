-- La reecriture differee des imports en LOT, regroupee dans un batch Anthropic
-- (moitie prix). L annonce nait avec le texte source (rewritePending), l entree
-- de la reecriture attend dans RewriteJob, un planificateur soumet et applique.
ALTER TABLE "Product" ADD COLUMN "rewritePending" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "RewriteJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "entree" JSONB NOT NULL,
  "batchId" TEXT,
  "statut" TEXT NOT NULL DEFAULT 'en_attente',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RewriteJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RewriteJob_productId_key" ON "RewriteJob"("productId");
CREATE INDEX "RewriteJob_statut_idx" ON "RewriteJob"("statut");

ALTER TABLE "RewriteJob" ADD CONSTRAINT "RewriteJob_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RewriteJob" ADD CONSTRAINT "RewriteJob_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
