import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UnitAvailabilityStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { CreateUnitDto } from './create-unit.dto';

export class UpdateUnitDto extends PartialType(CreateUnitDto) {
  @ApiPropertyOptional({
    enum: UnitAvailabilityStatus,
    description:
      'Manual operational status (e.g. MAINTENANCE, UNAVAILABLE). OCCUPIED is normally derived from an active Tenancy once Phase 3 lands — avoid hand-setting it once tenancies exist.',
  })
  @IsOptional()
  @IsEnum(UnitAvailabilityStatus)
  availabilityStatus?: UnitAvailabilityStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPubliclyListable?: boolean;
}
