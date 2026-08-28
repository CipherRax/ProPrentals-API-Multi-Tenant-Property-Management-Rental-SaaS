import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BuildingsService } from './buildings.service';
import { CreateBuildingDto } from './dto/create-building.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('buildings')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('organizations/:organizationId/properties/:propertyId/buildings')
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Post()
  create(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Body() dto: CreateBuildingDto,
  ) {
    return this.buildingsService.create(userId, organizationId, propertyId, dto);
  }

  @Get()
  findAll(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
  ) {
    return this.buildingsService.findAll(userId, organizationId, propertyId);
  }

  @Get(':buildingId')
  findOne(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('buildingId') buildingId: string,
  ) {
    return this.buildingsService.findOne(userId, organizationId, propertyId, buildingId);
  }

  @Patch(':buildingId')
  update(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('buildingId') buildingId: string,
    @Body() dto: UpdateBuildingDto,
  ) {
    return this.buildingsService.update(userId, organizationId, propertyId, buildingId, dto);
  }

  @Delete(':buildingId')
  remove(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('buildingId') buildingId: string,
  ) {
    return this.buildingsService.remove(userId, organizationId, propertyId, buildingId);
  }
}
