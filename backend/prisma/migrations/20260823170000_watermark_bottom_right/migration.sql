-- AlterTable : le filigrane se pose en bas a droite par defaut.
ALTER TABLE "User" ALTER COLUMN "watermarkPosition" SET DEFAULT 'southeast';

-- Les comptes existants suivent, personne n avait choisi ce reglage.
UPDATE "User" SET "watermarkPosition" = 'southeast' WHERE "watermarkPosition" = 'south';
