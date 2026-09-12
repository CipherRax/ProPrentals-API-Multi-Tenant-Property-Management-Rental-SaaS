import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class BulkVacancyItemDto {
  @ApiProperty()
  @IsUUID()
  unitTypeId: string;

  @ApiProperty({ description: 'Net vacancy change for this unit type', example: 3 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  @Min(-100_000)
  @Max(100_000)
  delta: number;
}

export class BulkVacancyDto {
  @ApiProperty({
    type: [BulkVacancyItemDto],
    description: '1–250 entries; AUTO-tracked types are skipped and reported.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(250)
  @ValidateNested({ each: true })
  @Type(() => BulkVacancyItemDto)
  items: BulkVacancyItemDto[];
}
