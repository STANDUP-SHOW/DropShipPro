-- Un logo par boutique. Un vendeur qui tient un site de mode et un site
-- high-tech ne signe pas ses photos de la meme facon.
ALTER TABLE "Shop" ADD COLUMN "logo" TEXT;
ALTER TABLE "Shop" ADD COLUMN "watermarkText" TEXT;
ALTER TABLE "Shop" ADD COLUMN "watermarkEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Shop" ADD COLUMN "watermarkScale" INTEGER;
ALTER TABLE "Shop" ADD COLUMN "watermarkOpacity" INTEGER;
ALTER TABLE "Shop" ADD COLUMN "watermarkPosition" TEXT;

-- La marque passe de l import a l export.
--
-- Les photos deja en base portent leur filigrane cuit dans le fichier : on ne
-- peut pas l en retirer. La colonne dit donc pour chaque annonce si ses images
-- sont deja marquees, et vaut « vrai » pour tout l existant -- sans quoi la
-- prochaine publication poserait une seconde marque par-dessus la premiere.
ALTER TABLE "Product" ADD COLUMN "imagesWatermarked" BOOLEAN NOT NULL DEFAULT true;

-- Les images marquees pour l export, et la signature des reglages qui les a
-- produites. Reglages changes, signature differente, images refaites : c est ce
-- qui permet de changer de logo sans reimporter quoi que ce soit.
ALTER TABLE "Product" ADD COLUMN "exportImages" JSONB;
ALTER TABLE "Product" ADD COLUMN "exportSignature" TEXT;
