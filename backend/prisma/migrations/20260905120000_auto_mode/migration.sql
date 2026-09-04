-- Le mode automatique (05/09/2026) : chaque chef de rayon porte son
-- interrupteur, et chaque agent d'administration le sien.
ALTER TABLE "Department" ADD COLUMN "autoMode" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AgentAutoSetting" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "agentKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentAutoSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgentAutoSetting_userId_agentKey_key" ON "AgentAutoSetting"("userId", "agentKey");
ALTER TABLE "AgentAutoSetting" ADD CONSTRAINT "AgentAutoSetting_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
