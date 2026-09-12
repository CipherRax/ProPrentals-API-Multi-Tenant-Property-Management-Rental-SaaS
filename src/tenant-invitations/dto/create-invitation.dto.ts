import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingFrequency } from '@prisma/client';
import {
  IsBoolean,
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

  @ApiPropertyOptional({
    description:
      "Monthly rent in the invitation. Omit to inherit the unit's current rent. Provide a value with customRent: true to override it.",
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  proposedRentAmount?: number;

  @ApiPropertyOptional({
    description:
      "Deposit in the invitation. Omit to inherit the unit's current deposit. Provide a value with customDeposit: true to override it.",
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  proposedDepositAmount?: number;

  @ApiPropertyOptional({
    description:
      "Must be true when proposedRentAmount differs from the unit's listed rent, so an override is always an explicit, auditable decision.",
  })
  @IsOptional()
  @IsBoolean()
  customRent?: boolean;

  @ApiPropertyOptional({
    description:
      "Must be true when proposedDepositAmount differs from the unit's listed deposit, so an override is always an explicit, auditable decision.",
  })
  @IsOptional()
  @IsBoolean()
  customDeposit?: boolean;

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
