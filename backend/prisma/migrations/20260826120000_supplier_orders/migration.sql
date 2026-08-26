-- La commande passee chez le fournisseur, et le garde-fou qui va avec.
ALTER TABLE "Order" ADD COLUMN "supplierOrderId" TEXT;
ALTER TABLE "Order" ADD COLUMN "supplierOrderStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN "supplierOrderCost" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN "supplierOrderedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "supplierOrderError" TEXT;
ALTER TABLE "Order" ADD COLUMN "supplierVariantRef" TEXT;

-- Commander sans demander reste a activer : engager l argent du vendeur sans
-- son accord n est pas un reglage qu on met a vrai par defaut.
ALTER TABLE "User" ADD COLUMN "autoOrder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "autoOrderMax" DECIMAL(10,2);
