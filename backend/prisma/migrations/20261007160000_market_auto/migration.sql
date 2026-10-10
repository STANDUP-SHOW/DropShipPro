-- Publication automatique sur DropShop Market (07/10/2026).
-- Ecrite a la main, sans base fantome ; purement additive (un booleen, true par defaut).
ALTER TABLE "User" ADD COLUMN "marketAuto" BOOLEAN NOT NULL DEFAULT true;
