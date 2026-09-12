import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UnitTypesService } from './unit-types.service';
import { CreateUnitTypeDto } from './dto/create-unit-type.dto';
import { UpdateUnitTypeDto } from './dto/update-unit-type.dto';
import { QueryUnitTypesDto } from './dto/query-unit-types.dto';
import { VacancyDeltaDto } from './dto/vacancy-delta.dto';
import { BulkVacancyDto } from './dto/bulk-vacancy.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgRoles } from '../auth/decorators/roles.decorator';

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB — matches StorageService

const uploadOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
    files: 1,
    fields: 4,
    parts: 10,
  },
};

@ApiTags('unit-types')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('organizations/:organizationId/properties/:propertyId/unit-types')
export class UnitTypesController {
  constructor(private readonly unitTypesService: UnitTypesService) {}

  @Post()
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  create(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Body() dto: CreateUnitTypeDto,
  ) {
    return this.unitTypesService.create(userId, organizationId, propertyId, dto);
  }

  @Get()
  findAll(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Query() query: QueryUnitTypesDto,
  ) {
    return this.unitTypesService.findAll(userId, organizationId, propertyId, query);
  }

  @Get(':unitTypeId')
  findOne(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitTypeId', ParseUUIDPipe) unitTypeId: string,
  ) {
    return this.unitTypesService.findOne(userId, organizationId, propertyId, unitTypeId);
  }

  @Patch(':unitTypeId')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  update(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitTypeId', ParseUUIDPipe) unitTypeId: string,
    @Body() dto: UpdateUnitTypeDto,
  ) {
    return this.unitTypesService.update(userId, organizationId, propertyId, unitTypeId, dto);
  }

  @Delete(':unitTypeId')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  remove(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitTypeId', ParseUUIDPipe) unitTypeId: string,
  ) {
    return this.unitTypesService.remove(userId, organizationId, propertyId, unitTypeId);
  }

  @Post(':unitTypeId/vacancy')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  adjustVacancy(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitTypeId', ParseUUIDPipe) unitTypeId: string,
    @Body() dto: VacancyDeltaDto,
  ) {
    return this.unitTypesService.adjustVacancy(
      userId,
      organizationId,
      propertyId,
      unitTypeId,
      dto.delta,
    );
  }

  @Post('vacancy-bulk')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  bulkAdjustVacancy(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Body() dto: BulkVacancyDto,
  ) {
    return this.unitTypesService.bulkAdjustVacancy(userId, organizationId, propertyId, dto.items);
  }

  @Post(':unitTypeId/sync')
  resync(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitTypeId', ParseUUIDPipe) unitTypeId: string,
  ) {
    return this.unitTypesService.resync(userId, organizationId, propertyId, unitTypeId);
  }

  @Post('sync-all')
  resyncAll(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
  ) {
    return this.unitTypesService.resyncAll(userId, organizationId, propertyId);
  }

  @Post(':unitTypeId/materialize')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  materialize(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitTypeId', ParseUUIDPipe) unitTypeId: string,
  ) {
    return this.unitTypesService.materializeUnit(userId, organizationId, propertyId, unitTypeId);
  }

  @Post(':unitTypeId/image')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadImage(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitTypeId', ParseUUIDPipe) unitTypeId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.unitTypesService.uploadImage(userId, organizationId, propertyId, unitTypeId, file);
  }
}
