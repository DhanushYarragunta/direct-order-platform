ALTER TYPE "OrderStatus" ADD VALUE 'OUT_FOR_DELIVERY';
ALTER TYPE "OrderStatus" ADD VALUE 'DELIVERED';
ALTER TABLE "User" ADD COLUMN "phone" TEXT, ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
ALTER TABLE "Outlet" ADD COLUMN "fssaiVerified" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "deliveryFeePaise" INTEGER NOT NULL DEFAULT 4000,
 ADD COLUMN "minDeliveryPaise" INTEGER NOT NULL DEFAULT 19900,
 ADD COLUMN "freeDeliveryAbovePaise" INTEGER NOT NULL DEFAULT 59900;
ALTER TABLE "Order" ADD COLUMN "deliveryFeePaise" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "deliveryLocalityId" TEXT,
 ADD COLUMN "checkoutStartedAt" TIMESTAMP(3),
 ADD COLUMN "checkoutDurationMs" INTEGER,
 ADD COLUMN "checkoutMetricSource" TEXT,
 ADD COLUMN "deliveredAt" TIMESTAMP(3);
CREATE TABLE "PhoneOtp" (
 "id" TEXT NOT NULL PRIMARY KEY, "phone" TEXT NOT NULL, "codeHash" TEXT NOT NULL,
 "name" TEXT NOT NULL, "consentAt" TIMESTAMP(3) NOT NULL, "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
 "attempts" INTEGER NOT NULL DEFAULT 0, "expiresAt" TIMESTAMP(3) NOT NULL,
 "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PhoneOtp_expiresAt_idx" ON "PhoneOtp"("expiresAt");
CREATE TABLE "ChannelBaseline" (
 "id" TEXT NOT NULL PRIMARY KEY, "outletId" TEXT NOT NULL,
 "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3) NOT NULL,
 "appOrders" INTEGER NOT NULL, "source" TEXT NOT NULL,
 "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ChannelBaseline_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ChannelBaseline_valid_period" CHECK ("periodEnd" > "periodStart" AND "appOrders" >= 0)
);
CREATE UNIQUE INDEX "ChannelBaseline_outletId_periodStart_periodEnd_key" ON "ChannelBaseline"("outletId", "periodStart", "periodEnd");
