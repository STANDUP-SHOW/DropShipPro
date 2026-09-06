-- L'agent de controle visuel des photos passe OFF par defaut (06/09/2026).
-- Il repassait Sonnet 5 en vision sur des photos deja choisies a la main
-- (~2 c/annonce). L'AUTO-SHIPPER le force toujours cote code, independamment
-- de ce reglage. Les comptes existants avaient tous la valeur par defaut (true)
-- que personne n'avait choisie : on les bascule sur false pour que la baisse de
-- cout s'applique tout de suite. Reversible : chaque vendeur peut le rallumer.
ALTER TABLE "User" ALTER COLUMN "controlAgent" SET DEFAULT false;
UPDATE "User" SET "controlAgent" = false;
