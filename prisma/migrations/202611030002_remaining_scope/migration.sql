-- CreateEnum
CREATE TYPE "CateringStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'DECLINED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Outlet" ADD COLUMN     "city" TEXT NOT NULL DEFAULT 'Hyderabad';

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "menuDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "menuEndMinute" INTEGER,
ADD COLUMN     "menuStartMinute" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "couponDiscountPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "placedAt" TIMESTAMP(3),
ADD COLUMN     "redeemedPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subtotalPaise" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MenuCityPrice" (
    "itemId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "familyPricePaise" INTEGER,

    CONSTRAINT "MenuCityPrice_pkey" PRIMARY KEY ("itemId","city")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "minSubtotalPaise" INTEGER NOT NULL,
    "maxDiscountPaise" INTEGER NOT NULL,
    "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "LoyaltyEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CateringRequest" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "guestCount" INTEGER NOT NULL,
    "occasion" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "menuNotes" TEXT NOT NULL,
    "budgetPaise" INTEGER,
    "status" "CateringStatus" NOT NULL DEFAULT 'REQUESTED',
    "managerNote" TEXT NOT NULL DEFAULT '',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CateringRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoyaltyEntry_userId_createdAt_idx" ON "LoyaltyEntry"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyEntry_orderId_kind_key" ON "LoyaltyEntry"("orderId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "CateringRequest_number_key" ON "CateringRequest"("number");

-- CreateIndex
CREATE INDEX "CateringRequest_outletId_status_eventAt_idx" ON "CateringRequest"("outletId", "status", "eventAt");

-- CreateIndex
CREATE INDEX "CateringRequest_userId_createdAt_idx" ON "CateringRequest"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CateringRequest_userId_requestKey_key" ON "CateringRequest"("userId", "requestKey");

-- CreateIndex
CREATE INDEX "Order_createdAt_outletId_idx" ON "Order"("createdAt", "outletId");

-- AddForeignKey
ALTER TABLE "MenuCityPrice" ADD CONSTRAINT "MenuCityPrice_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CateringRequest" ADD CONSTRAINT "CateringRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CateringRequest" ADD CONSTRAINT "CateringRequest_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Preserve existing commercial snapshots and their best available placed timestamp.
UPDATE "Order" SET "subtotalPaise" = "totalPaise";
UPDATE "Order" SET "placedAt" = "createdAt" WHERE "paymentStatus" IN ('PAID', 'REFUNDED');
ALTER TABLE "MenuItem" ALTER COLUMN "menuDays" SET NOT NULL;
ALTER TABLE "Order" ADD CONSTRAINT "Order_rewards_check" CHECK ("subtotalPaise" >= 0 AND "couponDiscountPaise" >= 0 AND "redeemedPoints" >= 0);
ALTER TABLE "CateringRequest" ADD CONSTRAINT "CateringRequest_limits_check" CHECK ("guestCount" BETWEEN 10 AND 500 AND ("budgetPaise" IS NULL OR "budgetPaise" BETWEEN 100000 AND 100000000) AND "version" >= 0);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_rules_check" CHECK ("type" IN ('FIXED', 'PERCENT') AND "value" > 0 AND ("type" <> 'PERCENT' OR "value" <= 100) AND "minSubtotalPaise" >= 0 AND "maxDiscountPaise" > 0 AND "expiresAt" > "startsAt");
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_schedule_check" CHECK (
  ("menuStartMinute" IS NULL AND "menuEndMinute" IS NULL AND cardinality("menuDays") = 0)
  OR ("menuStartMinute" IS NOT NULL AND "menuEndMinute" IS NOT NULL
    AND "menuStartMinute" BETWEEN 0 AND 1439 AND "menuEndMinute" BETWEEN 0 AND 1439
    AND "menuStartMinute" <> "menuEndMinute" AND cardinality("menuDays") BETWEEN 1 AND 7
    AND "menuDays" <@ ARRAY[0,1,2,3,4,5,6])
);
ALTER TABLE "MenuCityPrice" ADD CONSTRAINT "MenuCityPrice_price_check" CHECK (
  "pricePaise" BETWEEN 100 AND 1000000
  AND ("familyPricePaise" IS NULL OR "familyPricePaise" BETWEEN 100 AND 1000000)
  AND length("city") BETWEEN 2 AND 60 AND "city" = lower(btrim("city"))
);
