-- Deux logos de vitrine dedies, distincts du logo de filigrane : PNG ou SVG
-- gardes tels quels. En-tete (barre de titre) et accueil (~500 px, au-dessus
-- du titre du heros). Nullable : une boutique sans logo garde son nom en texte.
ALTER TABLE "Shop" ADD COLUMN "vitrineLogoEntete" TEXT;
ALTER TABLE "Shop" ADD COLUMN "vitrineLogoAccueil" TEXT;
