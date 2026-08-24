-- Le pilote automatique : importer et publier sans intervention, dans les
-- limites que le vendeur fixe.

CREATE TABLE "Autopilot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyLimit" INTEGER NOT NULL DEFAULT 5,
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "destinations" JSONB,
    "minMargin" INTEGER NOT NULL DEFAULT 50,
    "requireEuStock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Autopilot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Autopilot_userId_key" ON "Autopilot"("userId");

ALTER TABLE "Autopilot" ADD CONSTRAINT "Autopilot_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AutopilotRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "autopilotId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "published" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "log" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutopilotRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutopilotRun_userId_day_idx" ON "AutopilotRun"("userId", "day");

ALTER TABLE "AutopilotRun" ADD CONSTRAINT "AutopilotRun_autopilotId_fkey"
    FOREIGN KEY ("autopilotId") REFERENCES "Autopilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
