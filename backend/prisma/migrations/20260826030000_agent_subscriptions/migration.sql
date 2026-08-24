-- Les agents de comptoir payants : l avocat aujourd hui, d autres demain.
CREATE TABLE "AgentSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "paidUntil" TIMESTAMP(3) NOT NULL,
    "plan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentSubscription_userId_agentKey_key" ON "AgentSubscription"("userId", "agentKey");

ALTER TABLE "AgentSubscription" ADD CONSTRAINT "AgentSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
