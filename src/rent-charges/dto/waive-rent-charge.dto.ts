import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class WaiveRentChargeDto {
  @ApiProperty({ description: 'Why this charge is being waived — required for audit purposes' })
  @IsString()
  @MinLength(5)
  reason: string;
}
