-- Kaufland Global Marketplace, presente en France depuis 2026.
--
-- Ecrite a la main, sans base fantome : `prisma migrate diff
-- --shadow-database-url` vide la base qu on lui designe, et le 01/09/2026 cette
-- commande a supprime toutes les tables de production.
--
-- Postgres refuse d utiliser une valeur d enum dans la transaction qui la cree,
-- mais l ajouter seule ne pose aucun probleme : aucune ligne n y fait reference
-- avant le premier import vers cette destination.
ALTER TYPE "Platform" ADD VALUE 'KAUFLAND';
