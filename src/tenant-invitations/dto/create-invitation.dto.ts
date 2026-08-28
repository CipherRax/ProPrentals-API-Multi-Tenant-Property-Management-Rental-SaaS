import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingFrequency } from '@prisma/client';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateInvitationDto {
  @ApiProperty()
  @IsUUID()
  propertyId: string;

  @ApiProperty()
  @IsUUID()
  unitId: string;

  @ApiProperty({ example: 'John Kamau' })
  @IsString()
  tenantFullName: string;

  @ApiProperty({ example: 'john.kamau@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+254712345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ description: 'Monthly rent to be confirmed on acceptance' })
  @IsNumber()
  @Min(0)
  proposedRentAmount: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  proposedDepositAmount: number;

  @ApiPropertyOptional({ description: 'ISO date; defaults to today if omitted' })
  @IsOptional()
  @IsDateString()
  proposedStartDate?: string;

  @ApiPropertyOptional({ enum: BillingFrequency, default: BillingFrequency.MONTHLY })
  @IsOptional()
  @IsEnum(BillingFrequency)
  billingFrequency?: BillingFrequency;

  @ApiPropertyOptional({ default: 5, description: 'Day of the billing period rent is due' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  paymentDueDay?: number;

  @ApiPropertyOptional({ default: 7, description: 'Invitation validity in days' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}
