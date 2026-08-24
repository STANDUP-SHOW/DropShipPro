-- De quoi suivre un colis et joindre l acheteur depuis la fiche commande.
ALTER TABLE "Order" ADD COLUMN "carrier" TEXT;
ALTER TABLE "Order" ADD COLUMN "buyerEmail" TEXT;
