import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FurnishedStatus, UnitType, WaterAvailability } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateUnitDto {
  @ApiPropertyOptional({ description: 'Optional — omit if the unit is not inside a building' })
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @ApiProperty({ example: 'A-101' })
  @IsString()
  unitNumber: string;

  @ApiPropertyOptional({
    description: 'Unit type name (e.g. Bedsitter, 1BR, 2BR). If omitted, a new type is created.',
  })
  @IsOptional()
  @IsString()
  unitTypeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  floor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  bathrooms?: number;

  @ApiPropertyOptional({ description: 'Size in square meters' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sizeSqm?: number;

  @ApiProperty({ description: 'Monthly base rent, e.g. 15000.00' })
  @IsNumber()
  @Min(0)
  baseRent: number;

  @ApiProperty({ description: 'Refundable deposit amount' })
  @IsNumber()
  @Min(0)
  depositAmount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({ enum: UnitType })
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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  securityFeatures?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  proximityTags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  utilitiesIncluded?: string[];

  @ApiPropertyOptional({ description: 'Earliest move-in / availability date (ISO)' })
  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  @ApiPropertyOptional({ description: 'Opt into the public marketplace at creation time' })
  @IsOptional()
  isPubliclyListable?: boolean;
}
