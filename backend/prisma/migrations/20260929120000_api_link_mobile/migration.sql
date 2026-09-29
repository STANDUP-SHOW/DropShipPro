-- API Link de l'application mobile (29/09/2026) : préférences, état des
-- notifications dérivées, appareils à notifier. Écrite à la main, sans base
-- fantôme (règle du 01/09/2026). Purement additive.

ALTER TABLE "User" ADD COLUMN "mobilePrefs" JSONB;

CREATE TABLE "MobileNotificationState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MobileNotificationState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MobileNotificationState_userId_key_key" ON "MobileNotificationState"("userId", "key");
ALTER TABLE "MobileNotificationState" ADD CONSTRAINT "MobileNotificationState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PushDevice_deviceToken_key" ON "PushDevice"("deviceToken");
CREATE INDEX "PushDevice_userId_idx" ON "PushDevice"("userId");
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
