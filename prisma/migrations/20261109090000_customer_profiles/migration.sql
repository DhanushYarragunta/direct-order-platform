CREATE TABLE "SavedAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "pincode" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "localityId" TEXT,
    "locationKind" TEXT NOT NULL DEFAULT 'place',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SavedAddress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SavedAddress_label_check" CHECK ("label" IN ('Home', 'Work', 'Other')),
    CONSTRAINT "SavedAddress_locationKind_check" CHECK ("locationKind" IN ('place', 'area')),
    CONSTRAINT "SavedAddress_coordinates_check" CHECK (
        "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180
    ),
    CONSTRAINT "SavedAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SavedAddress_userId_createdAt_idx" ON "SavedAddress"("userId", "createdAt");
-- Prisma cannot express this partial index. Domain mutations also lock the user
-- row so every nonempty address book retains exactly one default.
CREATE UNIQUE INDEX "SavedAddress_one_default_per_user" ON "SavedAddress"("userId") WHERE "isDefault" = true;
