CREATE TABLE "GatewayWebhook" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "paymentId" TEXT,
    "refundId" TEXT,
    "refundPaymentId" TEXT,
    "testMode" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leasedUntil" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GatewayWebhook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GatewayWebhook_dedupeKey_key" ON "GatewayWebhook"("dedupeKey");
CREATE INDEX "GatewayWebhook_status_testMode_nextAttemptAt_idx" ON "GatewayWebhook"("status", "testMode", "nextAttemptAt");
CREATE INDEX "GatewayWebhook_status_leasedUntil_idx" ON "GatewayWebhook"("status", "leasedUntil");
