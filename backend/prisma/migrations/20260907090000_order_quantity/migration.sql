-- La quantite d une ligne de commande : la vitrine vend, un panier porte des
-- quantites, et N commandes identiques pour 1 article x N etaient illisibles.
ALTER TABLE "Order" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
