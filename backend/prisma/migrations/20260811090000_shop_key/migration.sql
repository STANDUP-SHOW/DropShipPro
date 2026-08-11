-- shopKey identifies a shop in the public catalogue URL.
-- Added in three steps because the column is required and rows already exist:
-- Prisma generates cuid() in the client, so the database has no default to fall
-- back on for those rows.
ALTER TABLE "User" ADD COLUMN "shopKey" TEXT;

UPDATE "User" SET "shopKey" = replace(gen_random_uuid()::text, '-', '') WHERE "shopKey" IS NULL;

ALTER TABLE "User" ALTER COLUMN "shopKey" SET NOT NULL;

CREATE UNIQUE INDEX "User_shopKey_key" ON "User"("shopKey");
