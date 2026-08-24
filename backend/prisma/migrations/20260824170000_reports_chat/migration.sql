-- Les rapports quotidiens archives, et les echanges avec les chefs de rayon.

CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT,
    "section" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- Un index unique ordinaire ignore les lignes ou departmentId est NULL, ce qui
-- laisserait s empiler autant de rapports « sans rayon » que de scans. Deux
-- index partiels couvrent les deux cas sans ce trou.
CREATE UNIQUE INDEX "Report_scoped_key" ON "Report"("userId", "departmentId", "section", "day")
    WHERE "departmentId" IS NOT NULL;
CREATE UNIQUE INDEX "Report_global_key" ON "Report"("userId", "section", "day")
    WHERE "departmentId" IS NULL;
CREATE INDEX "Report_userId_section_idx" ON "Report"("userId", "section");

ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "billed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatMessage_userId_departmentId_idx" ON "ChatMessage"("userId", "departmentId");

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
