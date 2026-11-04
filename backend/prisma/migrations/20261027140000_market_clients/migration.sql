-- DropShop Market, boutique complète (27/10/2026). Additive : quatre tables
-- neuves, des colonnes nullables sur Order et BuyerReview, rien n'est retiré.
CREATE TABLE "MarketClient" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailConfirmeAt" TIMESTAMP(3),
    "jetonConfirmation" TEXT,
    "jetonReinit" TEXT,
    "jetonReinitExpire" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "versionSession" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketClient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketClient_email_key" ON "MarketClient"("email");
CREATE UNIQUE INDEX "MarketClient_jetonConfirmation_key" ON "MarketClient"("jetonConfirmation");
CREATE UNIQUE INDEX "MarketClient_jetonReinit_key" ON "MarketClient"("jetonReinit");

CREATE TABLE "MarketAdresse" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "ligne1" TEXT NOT NULL,
    "ligne2" TEXT,
    "codePostal" TEXT NOT NULL,
    "ville" TEXT NOT NULL,
    "pays" TEXT NOT NULL,
    "telephone" TEXT,
    "parDefaut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketAdresse_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarketAdresse_clientId_idx" ON "MarketAdresse"("clientId");
ALTER TABLE "MarketAdresse" ADD CONSTRAINT "MarketAdresse_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "MarketClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MarketEnvie" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketEnvie_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketEnvie_clientId_productId_key" ON "MarketEnvie"("clientId", "productId");
ALTER TABLE "MarketEnvie" ADD CONSTRAINT "MarketEnvie_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "MarketClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MarketRetour" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "clientId" TEXT,
    "motif" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'DEMANDE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketRetour_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarketRetour_orderId_idx" ON "MarketRetour"("orderId");
ALTER TABLE "MarketRetour" ADD CONSTRAINT "MarketRetour_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketRetour" ADD CONSTRAINT "MarketRetour_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "MarketClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MarketContact" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "sujet" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "numero" TEXT,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketContact_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order" ADD COLUMN "marketNumero" TEXT;
ALTER TABLE "Order" ADD COLUMN "marketClientId" TEXT;
ALTER TABLE "Order" ADD COLUMN "stripeTransferId" TEXT;
ALTER TABLE "Order" ADD COLUMN "marketExpeditionAvisAt" TIMESTAMP(3);
CREATE INDEX "Order_marketNumero_idx" ON "Order"("marketNumero");
CREATE INDEX "Order_marketClientId_idx" ON "Order"("marketClientId");
ALTER TABLE "Order" ADD CONSTRAINT "Order_marketClientId_fkey" FOREIGN KEY ("marketClientId") REFERENCES "MarketClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BuyerReview" ADD COLUMN "marketClientId" TEXT;
