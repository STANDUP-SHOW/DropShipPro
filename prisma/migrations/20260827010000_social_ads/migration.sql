-- Le raccordement aux reseaux sociaux et aux regies publicitaires.
--
-- La table de correspondance vit chez nous, pas chez le fournisseur. C est elle
-- qui rend la decision reversible : changer de moteur revient a reecrire un
-- adaptateur, pas a redemander a mille vendeurs de reconnecter leurs comptes.
CREATE TABLE "SocialProfile" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  -- Le moteur qui tient la liaison : zernio, ou natif plus tard.
  "provider"   TEXT NOT NULL,
  -- L identifiant du profil chez ce moteur.
  "externalId" TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialProfile_userId_provider_key" ON "SocialProfile"("userId", "provider");
ALTER TABLE "SocialProfile" ADD CONSTRAINT "SocialProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SocialAccount" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "provider"   TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  -- facebook, instagram, tiktok, meta-ads, google-ads...
  "platform"   TEXT NOT NULL,
  -- Le nom que le vendeur reconnait : « OGGUS France ».
  "label"      TEXT,
  -- Faux des que le jeton est revoque cote plateforme.
  "connected"  BOOLEAN NOT NULL DEFAULT true,
  -- Un compte publicitaire ne publie pas de post, et inversement.
  "isAdAccount" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialAccount_userId_provider_externalId_key"
  ON "SocialAccount"("userId", "provider", "externalId");
CREATE INDEX "SocialAccount_userId_platform_idx" ON "SocialAccount"("userId", "platform");
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
