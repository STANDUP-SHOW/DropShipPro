-- Trois canaux qui sont À LA FOIS fournisseur et place de marché.
--
-- Constaté le 16/09/2026 : notre modèle sépare les deux annuaires — les
-- fournisseurs d'un côté, les canaux de vente de l'autre — et plusieurs
-- plateformes portent les deux casquettes. Wish et Etsy étaient déjà des deux
-- côtés ; Faire, Temu et AliExpress n'existaient que comme fournisseurs, alors
-- qu'un vendeur peut parfaitement y vendre.
--
-- Additif et sans risque : on ajoute des valeurs à un type, on n'en retire
-- aucune et on ne touche à aucune ligne. `IF NOT EXISTS` rend la migration
-- rejouable — Postgres refuse une valeur d'enum en double, et une migration
-- qui échoue à la relecture bloque toutes les suivantes.
--
-- Rappel qui a coûté cher le 01/09/2026 : cette migration s'applique avec
-- `prisma migrate deploy`, jamais avec une commande qui prend une base fantôme.

ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'FAIRE';
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'TEMU';
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'ALIEXPRESS';
