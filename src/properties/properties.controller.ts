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
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { QueryPropertiesDto } from './dto/query-properties.dto';
import { AddPropertyImageDto } from './dto/add-property-image.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgRoles } from '../auth/decorators/roles.decorator';

@ApiTags('properties')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('organizations/:organizationId/properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  create(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreatePropertyDto,
  ) {
    return this.propertiesService.create(userId, organizationId, dto);
  }

  @Get()
  findAll(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Query() query: QueryPropertiesDto,
  ) {
    return this.propertiesService.findAll(userId, organizationId, query);
  }

  @Get(':propertyId')
  findOne(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
  ) {
    return this.propertiesService.findOne(userId, organizationId, propertyId);
  }

  @Patch(':propertyId')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  update(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Body() dto: UpdatePropertyDto,
  ) {
    return this.propertiesService.update(userId, organizationId, propertyId, dto);
  }

  @Delete(':propertyId')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  remove(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
  ) {
    return this.propertiesService.remove(userId, organizationId, propertyId);
  }

  @Post(':propertyId/images')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  addImage(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Body() dto: AddPropertyImageDto,
  ) {
    return this.propertiesService.addImage(userId, organizationId, propertyId, dto);
  }

  @Post(':propertyId/images/upload')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage() }))
  uploadImages(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.propertiesService.uploadImages(userId, organizationId, propertyId, files);
  }

  @Delete(':propertyId/images/:imageId')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  removeImage(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.propertiesService.removeImage(userId, organizationId, propertyId, imageId);
  }
}
