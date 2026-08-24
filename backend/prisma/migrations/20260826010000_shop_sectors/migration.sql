-- Les rayons vendus par chaque boutique : c est ce qui filtre les categories
-- proposees a l import.
ALTER TABLE "Shop" ADD COLUMN "sectors" JSONB;
