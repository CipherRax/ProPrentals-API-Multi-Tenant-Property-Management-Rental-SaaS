-- CreateEnum
CREATE TYPE "UnitTypeTrackingMode" AS ENUM ('AUTO', 'MANUAL');

-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'VACANCY_ALERTS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'UNIT_TYPE_LOW_VACANCY';
ALTER TYPE "NotificationType" ADD VALUE 'UNIT_TYPE_FULLY_BOOKED';

-- AlterTable
ALTER TABLE "property_inquiries" ADD COLUMN     "holdReleasedAt" TIMESTAMP(3),
ADD COLUMN     "reservationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "reservedAt" TIMESTAMP(3),
ADD COLUMN     "unitTypeId" TEXT,
ADD COLUMN     "vacantAtInquiry" INTEGER;

-- AlterTable
ALTER TABLE "unit_type_definitions" ADD COLUMN     "bathrooms" INTEGER,
ADD COLUMN     "bedrooms" INTEGER,
ADD COLUMN     "sizeSqm" DECIMAL(10,2),
ADD COLUMN     "trackingMode" "UnitTypeTrackingMode" NOT NULL DEFAULT 'AUTO';

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "listIndividually" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "property_inquiries_unitTypeId_idx" ON "property_inquiries"("unitTypeId");

-- CreateIndex
CREATE INDEX "property_inquiries_unitTypeId_reservationExpiresAt_idx" ON "property_inquiries"("unitTypeId", "reservationExpiresAt");

-- CreateIndex
CREATE INDEX "unit_type_definitions_propertyId_isPubliclyListable_vacantC_idx" ON "unit_type_definitions"("propertyId", "isPubliclyListable", "vacantCount");

-- CreateIndex
CREATE INDEX "unit_type_definitions_isPubliclyListable_vacantCount_idx" ON "unit_type_definitions"("isPubliclyListable", "vacantCount");

-- AddForeignKey
ALTER TABLE "property_inquiries" ADD CONSTRAINT "property_inquiries_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "unit_type_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data backfill: existing physical units have no unit type (the type model
-- was introduced later). Group them into one definition per distinct
-- (property, baseRent, depositAmount) so a mismatched rent/spec is NEVER
-- silently merged into a single definition (spec: flag mismatches by NOT
-- merging). Counts are seeded from the real unit rows.
WITH grouped AS (
  SELECT u."propertyId",
         u."baseRent",
         u."depositAmount",
         count(*) FILTER (WHERE u."deletedAt" IS NULL) AS total,
         count(*) FILTER (WHERE u."deletedAt" IS NULL
              AND u."availabilityStatus" IN ('VACANT', 'AVAILABLE')) AS vacant,
         bool_or(u."isPubliclyListable") AS shouldList
  FROM units u
  WHERE u."unitTypeId" IS NULL
  GROUP BY u."propertyId", u."baseRent", u."depositAmount"
),
created AS (
  INSERT INTO unit_type_definitions
    (id, "propertyId", "typeName", "baseRent", "depositAmount",
     "trackingMode", "totalCount", "vacantCount", "isPubliclyListable",
     "description", "amenities", "createdAt", "updatedAt")
  SELECT gen_random_uuid(), g."propertyId",
         'Unit' || g."baseRent"::text,
         g."baseRent", g."depositAmount",
         'AUTO', g.total, g.vacant, g.shouldList,
         'Backfilled from existing physical units',
         ARRAY[]::TEXT[], now(), now()
  FROM grouped g
  RETURNING id, "propertyId", "baseRent", "depositAmount"
)
UPDATE units u
SET "unitTypeId" = c.id
FROM created c
WHERE u."unitTypeId" IS NULL
  AND u."propertyId" = c."propertyId"
  AND u."baseRent" = c."baseRent"
  AND u."depositAmount" = c."depositAmount";
