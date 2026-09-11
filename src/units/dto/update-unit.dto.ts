import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateUnitDto } from './create-unit.dto';
import { UnitAvailabilityStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class UpdateUnitDto extends PartialType(CreateUnitDto) {
  @ApiPropertyOptional({
    enum: UnitAvailabilityStatus,
    description:
      'Manual operational status (e.g. MAINTENANCE, UNAVAILABLE). OCCUPIED is normally derived from an active Tenancy once Phase 3 lands. Avoid hand-setting it once tenancies exist so the two sources of truth can not drift apart (spec 9).',
  })
  @IsOptional()
  @IsEnum(UnitAvailabilityStatus)
  availabilityStatus?: UnitAvailabilityStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPubliclyListable?: boolean;
}