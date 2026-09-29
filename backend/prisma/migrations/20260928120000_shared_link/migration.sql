-- Nouvelle table SharedLink : un lien partage (mobile aujourd hui, desktop
-- ensuite) en attente de recuperation par l'application companion. Migration
-- purement additive : aucune table existante n'est touchee.

CREATE TYPE "SharedLinkStatus" AS ENUM ('NEW', 'CLAIMED', 'DONE');

CREATE TABLE "SharedLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'mobile',
    "status" "SharedLinkStatus" NOT NULL DEFAULT 'NEW',
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SharedLink_userId_url_key" ON "SharedLink"("userId", "url");

CREATE INDEX "SharedLink_userId_status_idx" ON "SharedLink"("userId", "status");

ALTER TABLE "SharedLink" ADD CONSTRAINT "SharedLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
