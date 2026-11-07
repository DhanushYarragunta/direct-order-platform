-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUND_PENDING';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "estimateBaselineMae" DOUBLE PRECISION,
ADD COLUMN     "estimateHour" DOUBLE PRECISION,
ADD COLUMN     "estimateMinimumMinutes" INTEGER,
ADD COLUMN     "estimateModelVersion" TEXT,
ADD COLUMN     "estimateQueueWork" INTEGER,
ADD COLUMN     "estimateRawMinutes" DOUBLE PRECISION,
ADD COLUMN     "estimateSource" TEXT,
ADD COLUMN     "estimateStations" INTEGER,
ADD COLUMN     "estimateTrainingSamples" INTEGER,
ADD COLUMN     "estimateValidationMae" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'demo',
ADD COLUMN     "providerPaymentId" TEXT,
ADD COLUMN     "providerRefundId" TEXT,
ADD COLUMN     "providerRefundedPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refundAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refundLeaseUntil" TIMESTAMP(3),
ADD COLUMN     "refundNextAttemptAt" TIMESTAMP(3),
ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "refundReviewRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "testMode" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "PhoneOtp" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'demo',
ADD COLUMN     "providerId" TEXT,
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'sign_in',
ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "GatewayOrder" (
    "testMode" BOOLEAN NOT NULL DEFAULT true,
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "receipt" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GatewayOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOtp" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL DEFAULT 'demo',
    "userId" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'sign_in',

    CONSTRAINT "EmailOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageDelivery" (
    "provider" TEXT NOT NULL DEFAULT 'legacy',
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipientHash" TEXT,
    "firstAttemptAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "leasedUntil" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GatewayOrder_orderId_key" ON "GatewayOrder"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "GatewayOrder_receipt_key" ON "GatewayOrder"("receipt");

-- CreateIndex
CREATE UNIQUE INDEX "GatewayOrder_providerOrderId_key" ON "GatewayOrder"("providerOrderId");

-- CreateIndex
CREATE INDEX "GatewayOrder_nextCheckAt_idx" ON "GatewayOrder"("nextCheckAt");

-- CreateIndex
CREATE INDEX "EmailOtp_expiresAt_idx" ON "EmailOtp"("expiresAt");

-- CreateIndex
CREATE INDEX "MessageDelivery_status_nextAttemptAt_idx" ON "MessageDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageDelivery_messageId_channel_key" ON "MessageDelivery"("messageId", "channel");

-- CreateIndex
CREATE INDEX "Order_outletId_estimateSource_placedAt_idx" ON "Order"("outletId", "estimateSource", "placedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerRefundId_key" ON "Payment"("providerRefundId");

-- CreateIndex
CREATE INDEX "Payment_provider_status_refundNextAttemptAt_idx" ON "Payment"("provider", "status", "refundNextAttemptAt");

-- AddForeignKey
ALTER TABLE "GatewayOrder" ADD CONSTRAINT "GatewayOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDelivery" ADD CONSTRAINT "MessageDelivery_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
