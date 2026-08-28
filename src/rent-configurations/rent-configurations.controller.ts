import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RentConfigurationsService } from './rent-configurations.service';
import { CreateRentConfigurationDto } from './dto/create-rent-configuration.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('rent-configurations')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('organizations/:organizationId/tenancies/:tenancyId/rent-configurations')
export class RentConfigurationsController {
  constructor(private readonly rentConfigurationsService: RentConfigurationsService) {}

  @Post()
  create(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('tenancyId') tenancyId: string,
    @Body() dto: CreateRentConfigurationDto,
  ) {
    return this.rentConfigurationsService.create(userId, organizationId, tenancyId, dto);
  }

  @Get()
  findAll(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('tenancyId') tenancyId: string,
  ) {
    return this.rentConfigurationsService.listForTenancy(userId, organizationId, tenancyId);
  }
}
