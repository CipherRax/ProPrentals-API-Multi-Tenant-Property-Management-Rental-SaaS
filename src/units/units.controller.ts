import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UnitsService } from './units.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { QueryUnitsDto } from './dto/query-units.dto';
import { AddUnitImageDto } from './dto/add-unit-image.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgRoles } from '../auth/decorators/roles.decorator';

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB — matches StorageService

const uploadOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
    files: 10,
    fields: 4,
    parts: 20,
  },
};

@ApiTags('units')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('organizations/:organizationId/properties/:propertyId/units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Post()
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  create(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Body() dto: CreateUnitDto,
  ) {
    return this.unitsService.create(userId, organizationId, propertyId, dto);
  }

  @Get()
  findAll(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Query() query: QueryUnitsDto,
  ) {
    return this.unitsService.findAll(userId, organizationId, propertyId, query);
  }

  @Get(':unitId')
  findOne(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitId') unitId: string,
  ) {
    return this.unitsService.findOne(userId, organizationId, propertyId, unitId);
  }

  @Patch(':unitId')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  update(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitId') unitId: string,
    @Body() dto: UpdateUnitDto,
  ) {
    return this.unitsService.update(userId, organizationId, propertyId, unitId, dto);
  }

  @Delete(':unitId')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  remove(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitId') unitId: string,
  ) {
    return this.unitsService.remove(userId, organizationId, propertyId, unitId);
  }

  @Post(':unitId/images')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  addImage(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitId') unitId: string,
    @Body() dto: AddUnitImageDto,
  ) {
    return this.unitsService.addImage(userId, organizationId, propertyId, unitId, dto);
  }

  @Post(':unitId/images/upload')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  @UseInterceptors(FilesInterceptor('files', 10, uploadOptions))
  uploadImages(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitId') unitId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.unitsService.uploadImages(userId, organizationId, propertyId, unitId, files);
  }

  @Delete(':unitId/images/:imageId')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  removeImage(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitId') unitId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.unitsService.removeImage(userId, organizationId, propertyId, unitId, imageId);
  }
}
