-- Les demandes de canal : « je veux celle-la », comptees.
-- Migration ecrite a la main, sans base fantome ; sauvegarde prise avant.
CREATE TABLE "ChannelRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChannelRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChannelRequest_userId_canalId_key" ON "ChannelRequest"("userId", "canalId");
CREATE INDEX "ChannelRequest_canalId_idx" ON "ChannelRequest"("canalId");
ALTER TABLE "ChannelRequest" ADD CONSTRAINT "ChannelRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
