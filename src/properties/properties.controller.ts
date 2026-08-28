import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { QueryPropertiesDto } from './dto/query-properties.dto';
import { AddPropertyImageDto } from './dto/add-property-image.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('properties')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('organizations/:organizationId/properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
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
  update(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Body() dto: UpdatePropertyDto,
  ) {
    return this.propertiesService.update(userId, organizationId, propertyId, dto);
  }

  @Delete(':propertyId')
  remove(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
  ) {
    return this.propertiesService.remove(userId, organizationId, propertyId);
  }

  @Post(':propertyId/images')
  addImage(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Body() dto: AddPropertyImageDto,
  ) {
    return this.propertiesService.addImage(userId, organizationId, propertyId, dto);
  }

  @Delete(':propertyId/images/:imageId')
  removeImage(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.propertiesService.removeImage(userId, organizationId, propertyId, imageId);
  }
}
