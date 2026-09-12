import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { FurnishedStatus, UnitType, WaterAvailability } from '@prisma/client';

export class CreateUnitTypeDto {
  @ApiProperty({
    description: 'Type name shown in the marketplace, e.g. "1 Bedroom". Unique per property.',
  })
  @IsString()
  @MaxLength(120)
  typeName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @ApiProperty({ description: 'Base rent for the type, e.g. 15000.00' })
  @IsNumber()
  @Min(0)
  baseRent: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  depositAmount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({ description: 'Representative bedroom count for marketplace filtering' })
  @IsOptional()
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  bathrooms?: number;

  @ApiPropertyOptional({ description: 'Representative size in square meters' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sizeSqm?: number;

  @ApiPropertyOptional({
    description: 'Structured unit type used for marketplace filtering',
    enum: UnitType,
  })
  @IsOptional()
  @IsEnum(UnitType)
  unitType?: UnitType;

  @ApiPropertyOptional({ enum: FurnishedStatus })
  @IsOptional()
  @IsEnum(FurnishedStatus)
  furnishedStatus?: FurnishedStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  parkingAvailable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  parkingSpaces?: number;

  @ApiPropertyOptional({ enum: WaterAvailability })
  @IsOptional()
  @IsEnum(WaterAvailability)
  waterAvailability?: WaterAvailability;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  petFriendly?: boolean;

  @ApiPropertyOptional({
    description: 'Security features, e.g. GATED_COMPOUND, ON_SITE_GUARD, CCTV, ELECTRIC_FENCE',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  securityFeatures?: string[];

  @ApiPropertyOptional({
    description: 'Proximity tags, e.g. NEAR_MATATU_STAGE, NEAR_SCHOOLS, NEAR_HOSPITAL, NEAR_MARKET',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  proximityTags?: string[];

  @ApiPropertyOptional({
    description: 'Utilities included in rent, e.g. WATER, ELECTRICITY, GARBAGE',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  utilitiesIncluded?: string[];

  @ApiPropertyOptional({ description: 'Earliest move-in / availability date (ISO)' })
  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  @ApiPropertyOptional({
    description:
      'AUTO = counts derived from physical unit records + tenancy state (recommended). MANUAL = counts declared by the landlord via the +/- stepper.',
    enum: ['AUTO', 'MANUAL'],
  })
  @IsOptional()
  @IsIn(['AUTO', 'MANUAL'])
  trackingMode?: 'AUTO' | 'MANUAL';

  @ApiPropertyOptional({
    description:
      'Declared stock count. Only persisted when trackingMode is MANUAL (AUTO derives counts from units). Default 0.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  totalCount?: number;

  @ApiPropertyOptional({
    description: 'Declared vacancy. Only persisted when trackingMode is MANUAL. Default 0.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  vacantCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPubliclyListable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  representativeImage?: string;
}
