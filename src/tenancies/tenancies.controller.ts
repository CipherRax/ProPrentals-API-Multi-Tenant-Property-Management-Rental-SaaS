import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenanciesService } from './tenancies.service';
import { CreateTenancyDto } from './dto/create-tenancy.dto';
import { TerminateTenancyDto } from './dto/terminate-tenancy.dto';
import { QueryTenanciesDto } from './dto/query-tenancies.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('tenancies')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('organizations/:organizationId/tenancies')
export class TenanciesController {
  constructor(private readonly tenanciesService: TenanciesService) {}

  @Post()
  create(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateTenancyDto,
  ) {
    return this.tenanciesService.create(userId, organizationId, dto);
  }

  @Get()
  findAll(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Query() query: QueryTenanciesDto,
  ) {
    return this.tenanciesService.findAll(userId, organizationId, query);
  }

  @Get(':tenancyId')
  findOne(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('tenancyId') tenancyId: string,
  ) {
    return this.tenanciesService.findOne(userId, organizationId, tenancyId);
  }

  @Get(':tenancyId/financial-summary')
  getFinancialSummary(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('tenancyId') tenancyId: string,
  ) {
    return this.tenanciesService.getFinancialSummary(userId, organizationId, tenancyId);
  }

  @Patch(':tenancyId/terminate')
  terminate(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('tenancyId') tenancyId: string,
    @Body() dto: TerminateTenancyDto,
  ) {
    return this.tenanciesService.terminate(userId, organizationId, tenancyId, dto);
  }
}
