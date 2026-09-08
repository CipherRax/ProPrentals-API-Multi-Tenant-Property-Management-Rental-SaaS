import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingFrequency } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateRentConfigurationDto {
  @ApiProperty({ description: 'New rent amount effective from effectiveFrom' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ enum: BillingFrequency, default: BillingFrequency.MONTHLY })
  @IsOptional()
  @IsEnum(BillingFrequency)
  billingFrequency?: BillingFrequency;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  paymentDueDay?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  gracePeriodDays?: number;

  @ApiPropertyOptional({
    description: 'Flat amount, or a percentage of rent if lateFeeIsPercentage is true',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  lateFeeAmount?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  lateFeeIsPercentage?: boolean;

  @ApiProperty({ description: 'When this rent configuration takes effect' })
  @IsDateString()
  effectiveFrom: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
