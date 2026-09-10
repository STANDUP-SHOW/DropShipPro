-- Connexion « Sign in with Google ».
--
-- googleId : l'identifiant Google (claim `sub`) du compte. Null pour tous les
-- comptes créés par email/mot de passe ; l'index unique tolère plusieurs NULL
-- sous Postgres, donc les comptes existants ne se marchent pas dessus.
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- passwordHash devient nullable : un compte créé via Google seul n'a pas de mot
-- de passe. Additif — les hachages existants sont conservés tels quels.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
