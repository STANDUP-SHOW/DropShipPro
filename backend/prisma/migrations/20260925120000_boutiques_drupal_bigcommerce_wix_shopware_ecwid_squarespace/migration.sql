-- Six boutiques du vendeur de plus : Drupal Commerce, BigCommerce, Wix, Shopware, Ecwid, Squarespace (25/09/2026).
--
-- Ecrite a la main, sans base fantome (regle du 01/09/2026). Ajouter une valeur
-- d enum ne touche aucune ligne existante.
ALTER TYPE "Platform" ADD VALUE 'DRUPAL_COMMERCE';
ALTER TYPE "Platform" ADD VALUE 'BIGCOMMERCE';
ALTER TYPE "Platform" ADD VALUE 'WIX';
ALTER TYPE "Platform" ADD VALUE 'SHOPWARE';
ALTER TYPE "Platform" ADD VALUE 'ECWID';
ALTER TYPE "Platform" ADD VALUE 'SQUARESPACE';
