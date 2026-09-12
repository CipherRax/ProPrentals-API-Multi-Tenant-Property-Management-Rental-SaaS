import { Transform, Type } from 'class-transformer';
import { FurnishedStatus, UnitType, WaterAvailability } from '@prisma/client';
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
  Max,
  Min,
} from 'class-validator';

const toArray = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  const arr = Array.isArray(value) ? value : String(value).split(',');
  return arr.map((v) => String(v).trim()).filter(Boolean);
};

export class PublicListingsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  county?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsOptional()
  @IsString()
  estate?: string;

  @IsOptional()
  @IsString()
  propertyType?: string;

  @IsOptional()
  @IsEnum(UnitType)
  unitType?: UnitType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bathrooms?: number;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(FurnishedStatus, { each: true })
  furnished?: FurnishedStatus[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  parking?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  petFriendly?: boolean;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(WaterAvailability, { each: true })
  water?: WaterAvailability[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  securityFeatures?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  proximityTags?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  utilitiesIncluded?: string[];

  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeUnavailable?: boolean;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
