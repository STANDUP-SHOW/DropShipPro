-- La messagerie fournisseurs : echanges vendeur <-> fournisseur, dans une table
-- SEPAREE de la messagerie acheteurs (Conversation) pour ne jamais melanger les
-- deux boites. Migration purement additive : aucune table existante n est
-- touchee, donc aucun risque pour la messagerie acheteurs deja en service.

CREATE TYPE "SupplierConversationStatus" AS ENUM ('OPEN', 'WAITING', 'CLOSED');

CREATE TABLE "SupplierConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierEmail" TEXT,
    "subject" TEXT,
    "orderId" TEXT,
    "productId" TEXT,
    "status" "SupplierConversationStatus" NOT NULL DEFAULT 'OPEN',
    "unread" BOOLEAN NOT NULL DEFAULT true,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierConversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierConversation_userId_status_idx" ON "SupplierConversation"("userId", "status");

ALTER TABLE "SupplierConversation" ADD CONSTRAINT "SupplierConversation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SupplierMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" TEXT,
    "sentVia" TEXT,
    "drafted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierMessage_conversationId_idx" ON "SupplierMessage"("conversationId");

ALTER TABLE "SupplierMessage" ADD CONSTRAINT "SupplierMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "SupplierConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
