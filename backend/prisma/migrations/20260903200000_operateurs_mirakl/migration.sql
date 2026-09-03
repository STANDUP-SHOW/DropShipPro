-- Trente-six operateurs Mirakl rejoignent les destinations.
--
-- Sources croisees le 03/09/2026 : la liste des places de marche sous Mirakl
-- publiee par Shoppingfeed, intersectee avec notre annuaire. Un seul
-- connecteur les sert tous : l adresse de l operateur et la cle sont
-- saisies par le vendeur, rien n est code par enseigne.
--
-- Migration ecrite a la main, sans base fantome, appliquee par
-- `npx prisma migrate deploy`. Sauvegarde prise avant (1158 lignes).
ALTER TYPE "Platform" ADD VALUE 'ALLTRICKS';
ALTER TYPE "Platform" ADD VALUE 'AUCHAN';
ALTER TYPE "Platform" ADD VALUE 'BOULANGER';
ALTER TYPE "Platform" ADD VALUE 'BRICOMARCHE';
ALTER TYPE "Platform" ADD VALUE 'BUT';
ALTER TYPE "Platform" ADD VALUE 'CARREFOUR';
ALTER TYPE "Platform" ADD VALUE 'CONRAD';
ALTER TYPE "Platform" ADD VALUE 'CREAVEA';
ALTER TYPE "Platform" ADD VALUE 'CULTURA';
ALTER TYPE "Platform" ADD VALUE 'EL_CORTE_INGLES';
ALTER TYPE "Platform" ADD VALUE 'EPRICE';
ALTER TYPE "Platform" ADD VALUE 'GALERIA_INNO';
ALTER TYPE "Platform" ADD VALUE 'GALERIES_LAFAYETTE';
ALTER TYPE "Platform" ADD VALUE 'GREENWEEZ';
ALTER TYPE "Platform" ADD VALUE 'HOME24';
ALTER TYPE "Platform" ADD VALUE 'HUDSONS_BAY';
ALTER TYPE "Platform" ADD VALUE 'IBS';
ALTER TYPE "Platform" ADD VALUE 'LAPOSTE';
ALTER TYPE "Platform" ADD VALUE 'LDLC';
ALTER TYPE "Platform" ADD VALUE 'LEROY_MERLIN';
ALTER TYPE "Platform" ADD VALUE 'MAISONS_DU_MONDE';
ALTER TYPE "Platform" ADD VALUE 'MANOR';
ALTER TYPE "Platform" ADD VALUE 'MEDIAMARKT';
ALTER TYPE "Platform" ADD VALUE 'METRO';
ALTER TYPE "Platform" ADD VALUE 'NATURE_DECOUVERTES';
ALTER TYPE "Platform" ADD VALUE 'PCCOMPONENTES';
ALTER TYPE "Platform" ADD VALUE 'PHONEHOUSE';
ALTER TYPE "Platform" ADD VALUE 'PLACE_DES_TENDANCES';
ALTER TYPE "Platform" ADD VALUE 'RETIF';
ALTER TYPE "Platform" ADD VALUE 'SECRETSALES';
ALTER TYPE "Platform" ADD VALUE 'SHOWROOMPRIVE';
ALTER TYPE "Platform" ADD VALUE 'TRUFFAUT';
ALTER TYPE "Platform" ADD VALUE 'TWIL';
ALTER TYPE "Platform" ADD VALUE 'UBALDI';
ALTER TYPE "Platform" ADD VALUE 'WORTEN';
ALTER TYPE "Platform" ADD VALUE 'FNAC';
