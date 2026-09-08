import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsString, Min, MinLength } from 'class-validator';

export class CreateAdjustmentDto {
  @ApiProperty({
    enum: ['CREDIT', 'DEBIT'],
    description:
      'CREDIT reduces what the tenant owes (e.g. goodwill credit); DEBIT increases it (e.g. a manual charge not covered elsewhere)',
  })
  @IsIn(['CREDIT', 'DEBIT'])
  kind: 'CREDIT' | 'DEBIT';

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({
    description: 'Required — every manual ledger entry must be explained for audit purposes',
  })
  @IsString()
  @MinLength(5)
  reason: string;
}
