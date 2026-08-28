import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RentChargesService } from './rent-charges.service';
import { QueryRentChargesDto } from './dto/query-rent-charges.dto';
import { WaiveRentChargeDto } from './dto/waive-rent-charge.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrganizationsService } from '../organizations/organizations.service';

@ApiTags('rent-charges')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('organizations/:organizationId/rent-charges')
export class RentChargesController {
  constructor(
    private readonly rentChargesService: RentChargesService,
    private readonly organizations: OrganizationsService,
  ) {}

  @Get()
  findAll(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Query() query: QueryRentChargesDto,
  ) {
    return this.rentChargesService.findAll(userId, organizationId, query);
  }

  @Get(':rentChargeId')
  findOne(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('rentChargeId') rentChargeId: string,
  ) {
    return this.rentChargesService.findOne(userId, organizationId, rentChargeId);
  }

  @Patch(':rentChargeId/waive')
  waive(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('rentChargeId') rentChargeId: string,
    @Body() dto: WaiveRentChargeDto,
  ) {
    return this.rentChargesService.waive(userId, organizationId, rentChargeId, dto);
  }

  // Manual trigger for dev/QA so you don't have to wait for the nightly
  // cron to see rent generation happen. Runs the exact same code path as
  // the scheduled job — this is not a separate/fake implementation.
  @Post('generate-now')
  async generateNow(@CurrentUser('userId') userId: string, @Param('organizationId') organizationId: string) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (membership.role !== 'OWNER') {
      throw new ForbiddenException('Only the organization owner can manually trigger rent generation');
    }
    return this.rentChargesService.generateChargesForAllActiveTenancies();
  }
}
