-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('OWN_SITE', 'LEBONCOIN', 'VINTED', 'EBAY', 'AMAZON');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'READY', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'ORDERED_FROM_SUPPLIER', 'SHIPPED', 'DELIVERED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'RELEASED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "shopName" TEXT,
    "watermarkText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "label" TEXT,
    "data" JSONB NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceSite" TEXT,
    "sourceCategory" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "aiTitle" TEXT,
    "aiDescription" TEXT,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "markupPercent" INTEGER NOT NULL DEFAULT 50,
    "images" JSONB NOT NULL,
    "variants" JSONB,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'PENDING',
    "targetCategory" TEXT,
    "externalUrl" TEXT,
    "error" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "externalOrderId" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerAddress" JSONB NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "supplierOrderUrl" TEXT,
    "trackingNumber" TEXT,
    "shippingLabelUrl" TEXT,
    "receiptUrl" TEXT,
    "payoutStatus" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "platformBalance" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformCredential_userId_platform_key" ON "PlatformCredential"("userId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "Publication_productId_platform_key" ON "Publication"("productId", "platform");

-- AddForeignKey
ALTER TABLE "PlatformCredential" ADD CONSTRAINT "PlatformCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
