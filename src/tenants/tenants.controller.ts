import { Controller, Delete, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { QueryTenantsDto } from './dto/query-tenants.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('organizations/:organizationId/tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  findAll(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Query() query: QueryTenantsDto,
  ) {
    return this.tenantsService.findAll(userId, organizationId, query);
  }

  @Get(':tenantProfileId')
  findOne(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('tenantProfileId') tenantProfileId: string,
  ) {
    return this.tenantsService.findOne(userId, organizationId, tenantProfileId);
  }

  @Delete(':tenantProfileId')
  deactivate(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('tenantProfileId') tenantProfileId: string,
  ) {
    return this.tenantsService.deactivate(userId, organizationId, tenantProfileId);
  }
}
