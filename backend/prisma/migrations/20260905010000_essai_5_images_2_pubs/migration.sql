-- L'essai gratuit du compte, tel que le produit le definit (05/09/2026) :
-- dix annonces, cinq images et deux publicites offertes. Une publicite coute
-- deux credits image : le solde de depart passe donc de 10 a 9 (5 + 2x2).
-- Les comptes existants gardent leur solde tel quel.
ALTER TABLE "User" ALTER COLUMN "imageCredits" SET DEFAULT 9;
