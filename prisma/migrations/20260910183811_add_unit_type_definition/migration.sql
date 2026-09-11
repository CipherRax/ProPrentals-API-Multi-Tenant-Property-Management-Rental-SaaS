/*
  Warnings:

  - You are about to drop the column `unitType` on the `units` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "units" DROP COLUMN "unitType",
ADD COLUMN     "unitTypeId" TEXT;

-- CreateTable
CREATE TABLE "unit_type_definitions" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "buildingId" TEXT,
    "typeName" TEXT NOT NULL,
    "baseRent" DECIMAL(12,2) NOT NULL,
    "depositAmount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "vacantCount" INTEGER NOT NULL DEFAULT 0,
    "representativeImage" TEXT,
    "isPubliclyListable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "unit_type_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "unit_type_definitions_propertyId_vacantCount_idx" ON "unit_type_definitions"("propertyId", "vacantCount");

-- CreateIndex
CREATE UNIQUE INDEX "unit_type_definitions_propertyId_typeName_key" ON "unit_type_definitions"("propertyId", "typeName");

-- AddForeignKey
ALTER TABLE "unit_type_definitions" ADD CONSTRAINT "unit_type_definitions_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_type_definitions" ADD CONSTRAINT "unit_type_definitions_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "unit_type_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
