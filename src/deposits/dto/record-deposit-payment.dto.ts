import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

// Deliberately a simple, standalone recording endpoint rather than
// routed through the M-Pesa/manual Payment + allocation machinery from
// Phase 6 — deposits are a different financial event from rent, and
// reusing that pipeline as-is would have allocated the money against
// outstanding rent charges instead of crediting the deposit. Wiring
// deposits through STK Push is a reasonable future enhancement,
// flagged in the README rather than built into this phase.
export class RecordDepositPaymentDto {
  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ description: 'Bank ref, M-Pesa code, cheque number, etc.' })
  @IsOptional()
  @IsString()
  manualReference?: string;
}
