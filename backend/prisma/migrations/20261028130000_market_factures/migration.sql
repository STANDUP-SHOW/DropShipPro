-- DropShop Market : factures des vendeurs, remboursement en un clic, suivi des
-- retours (28/10/2026). Additive : colonnes nullables ou avec défaut.
ALTER TABLE "User" ADD COLUMN "factureIdentite" JSONB;
ALTER TABLE "User" ADD COLUMN "factureCompteur" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Order" ADD COLUMN "factureNumero" TEXT;
ALTER TABLE "Order" ADD COLUMN "factureEmiseAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "avoirNumero" TEXT;
ALTER TABLE "Order" ADD COLUMN "stripeRefundId" TEXT;
ALTER TABLE "Order" ADD COLUMN "rembourseAt" TIMESTAMP(3);

ALTER TABLE "MarketRetour" ADD COLUMN "reponse" TEXT;
ALTER TABLE "MarketRetour" ADD COLUMN "adresseRetour" TEXT;
ALTER TABLE "MarketRetour" ADD COLUMN "majAt" TIMESTAMP(3);
