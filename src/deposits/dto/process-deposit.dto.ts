import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class DeductionInput {
  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ description: 'Required — every deduction must be explained (spec §23)' })
  @IsString()
  @MinLength(5)
  reason: string;
}

// Processes the deposit once a tenancy has ended: any number of
// itemized deductions (damages, unpaid utilities, etc.) plus a refund
// of whatever remains. deductions + refundAmount must not exceed what
// was actually paid in — enforced in the service, not just assumed.
export class ProcessDepositDto {
  @ApiPropertyOptional({ type: [DeductionInput] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeductionInput)
  deductions?: DeductionInput[];

  @ApiPropertyOptional({ description: 'Amount to refund to the tenant, if any' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  refundAmount?: number;
}
