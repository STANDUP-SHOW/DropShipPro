-- AlterEnum
-- Shopify is a store platform, not a marketplace: the merchant owns the shop and
-- issues the Admin API token themselves, so publishing really goes through.
ALTER TYPE "Platform" ADD VALUE 'SHOPIFY';
