-- Les chefs de rayon : un agent par secteur, chez chaque vendeur.

CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Department_userId_key_key" ON "Department"("userId", "key");

ALTER TABLE "Department" ADD CONSTRAINT "Department_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Opportunity" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "Signal" ADD COLUMN "departmentId" TEXT;

-- SET NULL et non CASCADE : rendre un rayon ne doit pas effacer ce que l agent
-- avait trouve, le vendeur peut encore vouloir l importer.
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Opportunity_departmentId_idx" ON "Opportunity"("departmentId");
CREATE INDEX "Signal_departmentId_idx" ON "Signal"("departmentId");
