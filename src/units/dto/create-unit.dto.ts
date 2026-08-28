import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UnitType } from '@prisma/client';
import {
  IsArray,
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

  @ApiProperty({ enum: UnitType })
  unitType: UnitType;

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
}
