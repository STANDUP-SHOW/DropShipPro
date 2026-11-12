-- Newsletter envoyée depuis Kantix (12/11/2026) : les adresses qui ont cliqué
-- « se désinscrire ». Additive : une table neuve, rien d'existant n'est touché.
CREATE TABLE "NewsletterDesinscription" (
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,

    CONSTRAINT "NewsletterDesinscription_pkey" PRIMARY KEY ("email")
);
