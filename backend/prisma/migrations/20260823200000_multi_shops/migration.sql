-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shopKey" TEXT NOT NULL,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopKey_key" ON "Shop"("shopKey");
CREATE INDEX "Shop_userId_idx" ON "Shop"("userId");

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "shopId" TEXT;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reprise : chaque compte garde sa boutique actuelle, avec sa cle existante, pour
-- que les flux deja branches sur un site continuent de repondre.
INSERT INTO "Shop" ("id", "userId", "name", "shopKey", "createdAt")
SELECT "id", "id", COALESCE("shopName", 'Ma boutique'), "shopKey", "createdAt" FROM "User";

-- Les annonces existantes rejoignent cette boutique par defaut.
UPDATE "Product" SET "shopId" = "userId" WHERE "shopId" IS NULL;
