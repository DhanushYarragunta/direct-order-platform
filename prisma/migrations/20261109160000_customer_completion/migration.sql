CREATE TABLE "Favorite" (
  "userId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId", "itemId"),
  CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Favorite_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Favorite_itemId_idx" ON "Favorite"("itemId");
ALTER TABLE "Coupon" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "couponFirstOrderOnly" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Order" o SET "couponFirstOrderOnly" = c."firstOrderOnly" FROM "Coupon" c WHERE o."couponCode" = c."code";
