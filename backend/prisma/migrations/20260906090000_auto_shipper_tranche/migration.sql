-- Le passage automatique par tranche de 12 h : la garde vit en base pour
-- survivre aux redemarrages Railway, comme la garde des enquetes.
ALTER TABLE "Autopilot" ADD COLUMN "lastAutoRunAt" TIMESTAMP(3);
