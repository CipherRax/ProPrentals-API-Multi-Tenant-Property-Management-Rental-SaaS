-- CreateEnum
CREATE TYPE "FurnishedStatus" AS ENUM ('UNFURNISHED', 'SEMI_FURNISHED', 'FULLY_FURNISHED');

-- CreateEnum
CREATE TYPE "WaterAvailability" AS ENUM ('BOREHOLE', 'PIPED', 'TWENTY_FOUR_HOUR', 'NONE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UnitType" ADD VALUE 'BUNGALOW';
ALTER TYPE "UnitType" ADD VALUE 'STUDIO';

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "estate" TEXT;

-- AlterTable
ALTER TABLE "tenancies" ADD COLUMN     "customDeposit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customRent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tenant_invitations" ADD COLUMN     "customDeposit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customRent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "unit_type_definitions" ADD COLUMN     "availableFrom" TIMESTAMP(3),
ADD COLUMN     "furnishedStatus" "FurnishedStatus",
ADD COLUMN     "parkingAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parkingSpaces" INTEGER,
ADD COLUMN     "petFriendly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proximityTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "securityFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "unitType" "UnitType" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "utilitiesIncluded" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "waterAvailability" "WaterAvailability";

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "availableFrom" TIMESTAMP(3),
ADD COLUMN     "furnishedStatus" "FurnishedStatus",
ADD COLUMN     "parkingAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parkingSpaces" INTEGER,
ADD COLUMN     "petFriendly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proximityTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "securityFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "unitType" "UnitType" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "utilitiesIncluded" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "waterAvailability" "WaterAvailability";
