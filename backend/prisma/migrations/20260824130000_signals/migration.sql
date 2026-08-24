-- Les signaux de marche : ce qu un agent de veille observe sans que ce soit un
-- produit importable. Une marque qui perce, une categorie en croissance, un
-- prix constate.

CREATE TYPE "SignalKind" AS ENUM ('SOCIAL', 'MARKET');
CREATE TYPE "SignalStatus" AS ENUM ('NEW', 'KEPT', 'REJECTED');

CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "SignalKind" NOT NULL,
    "platform" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "url" TEXT,
    "category" TEXT,
    "brand" TEXT,
    "metrics" JSONB,
    "engagementScore" INTEGER,
    "trendScore" INTEGER,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "status" "SignalStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "raw" JSONB,
    "fingerprint" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Signal_userId_fingerprint_key" ON "Signal"("userId", "fingerprint");
CREATE INDEX "Signal_userId_kind_status_idx" ON "Signal"("userId", "kind", "status");

ALTER TABLE "Signal" ADD CONSTRAINT "Signal_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
