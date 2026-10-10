-- Affiliation (07/10/2026) : un affilié touche, à vie, 10 % des euros que ses
-- filleuls dépensent en recharges de drops. Compte affilié séparé (code
-- d'accès par mail), payé en euros. Écrite à la main, sans base fantôme ;
-- purement additive.
CREATE TABLE "Affilie" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "cleHash" TEXT,
    "cleEmiseLe" TIMESTAMP(3),
    "titulaire" TEXT,
    "iban" TEXT,
    "ibanMajLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Affilie_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Affilie_email_key" ON "Affilie"("email");
CREATE UNIQUE INDEX "Affilie_code_key" ON "Affilie"("code");

CREATE TABLE "AffiliationClic" (
    "id" TEXT NOT NULL,
    "affilieId" TEXT NOT NULL,
    "page" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliationClic_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AffiliationClic_affilieId_createdAt_idx" ON "AffiliationClic"("affilieId", "createdAt");
ALTER TABLE "AffiliationClic" ADD CONSTRAINT "AffiliationClic_affilieId_fkey" FOREIGN KEY ("affilieId") REFERENCES "Affilie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "affilieId" TEXT;
CREATE INDEX "User_affilieId_idx" ON "User"("affilieId");
ALTER TABLE "User" ADD CONSTRAINT "User_affilieId_fkey" FOREIGN KEY ("affilieId") REFERENCES "Affilie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "affilieId" TEXT NOT NULL,
    "filleulId" TEXT,
    "paiementRef" TEXT NOT NULL,
    "montantCentimes" INTEGER NOT NULL,
    "commissionCentimes" INTEGER NOT NULL,
    "payeeLe" TIMESTAMP(3),
    "versementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Commission_paiementRef_key" ON "Commission"("paiementRef");
CREATE INDEX "Commission_affilieId_createdAt_idx" ON "Commission"("affilieId", "createdAt");
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_affilieId_fkey" FOREIGN KEY ("affilieId") REFERENCES "Affilie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_filleulId_fkey" FOREIGN KEY ("filleulId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Versement" (
    "id" TEXT NOT NULL,
    "affilieId" TEXT NOT NULL,
    "montantCentimes" INTEGER NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Versement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Versement_affilieId_createdAt_idx" ON "Versement"("affilieId", "createdAt");
ALTER TABLE "Versement" ADD CONSTRAINT "Versement_affilieId_fkey" FOREIGN KEY ("affilieId") REFERENCES "Affilie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_versementId_fkey" FOREIGN KEY ("versementId") REFERENCES "Versement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
