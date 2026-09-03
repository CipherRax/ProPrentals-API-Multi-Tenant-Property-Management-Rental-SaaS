import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RecordManualPaymentDto {
  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ enum: PaymentMethod, description: 'Must not be MPESA — use the STK Push flow for that' })
  @IsIn(['CASH', 'BANK_TRANSFER', 'OTHER'])
  method: Extract<PaymentMethod, 'CASH' | 'BANK_TRANSFER' | 'OTHER'>;

  @ApiPropertyOptional({ description: 'Bank reference, cheque number, till slip number, etc.' })
  @IsOptional()
  @IsString()
  manualReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'When the payment was actually received; defaults to now' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
