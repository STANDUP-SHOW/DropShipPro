-- La messagerie acheteurs, toutes plateformes confondues.

CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'WAITING', 'CLOSED');

CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "externalId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "subject" TEXT,
    "productId" TEXT,
    "orderId" TEXT,
    "departmentId" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "unread" BOOLEAN NOT NULL DEFAULT true,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Conversation_userId_status_idx" ON "Conversation"("userId", "status");
CREATE INDEX "Conversation_userId_platform_idx" ON "Conversation"("userId", "platform");

-- Une conversation deja ouverte chez la plateforme ne doit pas se dedoubler a
-- chaque remontee. L index est partiel : la plupart des sources ne donnent
-- aucun identifiant, et un index ordinaire les considererait toutes distinctes.
CREATE UNIQUE INDEX "Conversation_external_key" ON "Conversation"("userId", "platform", "externalId")
    WHERE "externalId" IS NOT NULL;

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CustomerMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" TEXT,
    "sentVia" TEXT,
    "drafted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerMessage_conversationId_idx" ON "CustomerMessage"("conversationId");

ALTER TABLE "CustomerMessage" ADD CONSTRAINT "CustomerMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
