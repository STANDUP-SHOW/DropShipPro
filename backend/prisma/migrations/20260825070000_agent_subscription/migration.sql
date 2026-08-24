-- L abonnement d un chef de rayon : a la journee, a la semaine ou au mois.
ALTER TABLE "Department" ADD COLUMN "paidUntil" TIMESTAMP(3);
ALTER TABLE "Department" ADD COLUMN "plan" TEXT;

-- Les rayons deja confies gardent leur travail : une semaine offerte, le temps
-- que leur vendeur decouvre l abonnement au lieu de voir son agent s arreter.
UPDATE "Department" SET "paidUntil" = NOW() + INTERVAL '7 days', "plan" = 'offert'
WHERE "paidUntil" IS NULL;
