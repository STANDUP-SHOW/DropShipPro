-- « Non confirme » n est pas « non ». Un agent de veille echoue souvent a
-- prouver la presence d un entrepot europeen ; le lui faire declarer « pas de
-- stock UE » fait ecarter des produits valables.
ALTER TABLE "Opportunity" ALTER COLUMN "euStock" DROP NOT NULL;
ALTER TABLE "Opportunity" ALTER COLUMN "euStock" DROP DEFAULT;
UPDATE "Opportunity" SET "euStock" = NULL WHERE "euStock" = false;

-- Le delai tel que la plateforme l ecrit : « 3-5 jours ouvres », « sous 48h ».
-- Le nombre seul perdait l information, et un format inattendu faisait perdre
-- tout le lot.
ALTER TABLE "Opportunity" ADD COLUMN "deliveryText" TEXT;
