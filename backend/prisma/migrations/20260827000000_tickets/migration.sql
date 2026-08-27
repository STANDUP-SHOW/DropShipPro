-- Les tickets internes : le vendeur signale, les agents repondent.
--
-- Le rendu de credit automatique a ete ecarte volontairement. Un bouton qui
-- recredite tout seul se presse par reflexe et n apprend rien a personne : ni
-- pourquoi le resultat etait mauvais, ni combien de fois ca arrive. Un ticket
-- laisse une trace, une reponse, et une decision prise par quelqu un.
CREATE TABLE "Ticket" (
  "id"      TEXT NOT NULL,
  "userId"  TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  -- pub, image, import, publication, facturation, autre
  "kind"    TEXT NOT NULL DEFAULT 'autre',
  -- OUVERT, EN_COURS, RESOLU, REFUSE
  "status"  TEXT NOT NULL DEFAULT 'OUVERT',

  -- Ce dont on parle, pour que l agent voie l objet du litige.
  "productId"        TEXT,
  "generatedImageId" TEXT,

  -- Ce que l objet a coute au vendeur. Il borne l avoir : un agent ne peut pas
  -- rendre plus que ce qui a ete pris.
  "creditsSpent" INTEGER,
  -- Le genre de credit concerne : image ou annonce.
  "creditKind"   TEXT NOT NULL DEFAULT 'image',

  -- L avoir accorde, quand il l a ete, et par quel agent.
  "refundedCredits" INTEGER,
  "refundedAt"      TIMESTAMP(3),
  "refundedBy"      TEXT,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Ticket_userId_status_idx" ON "Ticket"("userId", "status");
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TicketMessage" (
  "id"       TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  -- vendeur ou agent
  "author"   TEXT NOT NULL,
  -- La cle de l agent qui repond : hotline, sav, comptable.
  "agentKey" TEXT,
  "body"     TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TicketMessage_ticketId_idx" ON "TicketMessage"("ticketId");
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
