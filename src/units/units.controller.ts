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
import { UnitsService } from './units.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { QueryUnitsDto } from './dto/query-units.dto';
import { AddUnitImageDto } from './dto/add-unit-image.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('units')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('organizations/:organizationId/properties/:propertyId/units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Post()
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
  remove(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitId') unitId: string,
  ) {
    return this.unitsService.remove(userId, organizationId, propertyId, unitId);
  }

  @Post(':unitId/images')
  addImage(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitId') unitId: string,
    @Body() dto: AddUnitImageDto,
  ) {
    return this.unitsService.addImage(userId, organizationId, propertyId, unitId, dto);
  }

  @Delete(':unitId/images/:imageId')
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
