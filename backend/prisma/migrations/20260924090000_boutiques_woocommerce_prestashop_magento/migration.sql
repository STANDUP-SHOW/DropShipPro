-- Les boutiques du vendeur hors Shopify : WooCommerce, PrestaShop, Magento (24/09/2026).
--
-- Ecrite a la main, sans base fantome (regle du 01/09/2026). Ajouter une valeur
-- d enum ne touche aucune ligne existante.
ALTER TYPE "Platform" ADD VALUE 'WOOCOMMERCE';
ALTER TYPE "Platform" ADD VALUE 'PRESTASHOP';
ALTER TYPE "Platform" ADD VALUE 'MAGENTO';
