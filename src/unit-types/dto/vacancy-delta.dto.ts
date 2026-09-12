import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, Max, Min } from 'class-validator';

export class VacancyDeltaDto {
  @ApiProperty({
    description:
      'Net vacancy change. Positive increases vacancy (+1 stepper tap), negative decreases it. Bounds are clamped to [0, totalCount].',
    example: -1,
  })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  @Min(-100_000)
  @Max(100_000)
  delta: number;
}
