-- Les agents transverses — hotline, commercial, SAV, livraisons — parlent au
-- vendeur comme un chef de rayon, mais ne tiennent aucun rayon. La conversation
-- se rattache donc soit a un rayon, soit a l un d eux.
ALTER TABLE "ChatMessage" ALTER COLUMN "departmentId" DROP NOT NULL;
ALTER TABLE "ChatMessage" ADD COLUMN "supportAgent" TEXT;
CREATE INDEX "ChatMessage_userId_supportAgent_idx" ON "ChatMessage"("userId", "supportAgent");
