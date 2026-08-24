-- L agent de controle visuel : actif par defaut, c est lui qui rend le mode
-- automatique fiable.
ALTER TABLE "User" ADD COLUMN "controlAgent" BOOLEAN NOT NULL DEFAULT true;
