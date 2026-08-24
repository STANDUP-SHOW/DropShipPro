-- Cles d API machine et boite a opportunites : de quoi laisser un agent de
-- veille externe deposer ses trouvailles sans jamais publier a la place du
-- vendeur.

CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "OpportunityStatus" AS ENUM ('NEW', 'KEPT', 'REJECTED', 'IMPORTED');

CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image" TEXT,
    "category" TEXT,
    "sourcePrice" DECIMAL(10,2) NOT NULL,
    "marketPrice" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "salesCount" INTEGER,
    "euStock" BOOLEAN NOT NULL DEFAULT false,
    "deliveryDays" INTEGER,
    "warranty" TEXT,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "raw" JSONB,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'NEW',
    "productId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Opportunity_userId_sourceUrl_key" ON "Opportunity"("userId", "sourceUrl");
CREATE INDEX "Opportunity_userId_status_idx" ON "Opportunity"("userId", "status");

ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
