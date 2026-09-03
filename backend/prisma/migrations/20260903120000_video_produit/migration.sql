-- La video du vendeur, televersee a la main. Jamais celle d un fournisseur.
--
-- Ecrite a la main, sans base fantome : `prisma migrate diff
-- --shadow-database-url` vide la base qu on lui designe, et le 01/09/2026 cette
-- commande a supprime toutes les tables de production. S applique avec
-- `npx prisma migrate deploy`, qui n avance que vers l avant.
ALTER TABLE "Product" ADD COLUMN "videoUrl" TEXT;
