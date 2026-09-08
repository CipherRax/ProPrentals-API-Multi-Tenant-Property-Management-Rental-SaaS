import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Tenant Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('tenants/me/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Aggregated tenant dashboard (tenancy, balance, rent, notifications)' })
  getTenantDashboard(@CurrentUser('userId') userId: string) {
    return this.dashboard.tenantDashboard(userId);
  }
}
