import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { AdminService } from './admin.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { PlatformRolesGuard } from '../auth/guards/platform-roles.guard';
import { PlatformRoles } from '../auth/decorators/platform-roles.decorator';

class UpdateVerificationDto {
  @IsIn(['PENDING', 'VERIFIED', 'REJECTED', 'UNVERIFIED'])
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'UNVERIFIED';

  @IsOptional()
  @IsString()
  reason?: string;
}

@ApiTags('Platform Admin')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard, PlatformRolesGuard)
@PlatformRoles('SUPER_ADMIN', 'SUPPORT_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('organizations')
  @ApiOperation({ summary: 'List all organizations (platform staff)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  listOrganizations(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.admin.listOrganizations({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
    });
  }

  @Get('organizations/:organizationId')
  @ApiOperation({ summary: 'Organization detail with subscription and counts' })
  organizationDetail(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.admin.getOrganizationDetail(organizationId);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Platform dashboard: revenue, tenant counts, verification queue' })
  dashboard() {
    return this.admin.platformDashboard();
  }

  @Get('payment-activity')
  @ApiOperation({ summary: 'Recent platform subscription payment activity' })
  paymentActivity(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.admin.platformPaymentActivity({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('verification-requests')
  @ApiOperation({ summary: 'Properties awaiting verification (filterable by status)' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'VERIFIED', 'REJECTED', 'UNVERIFIED'],
  })
  verificationRequests(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.admin.listVerificationRequests({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
    });
  }

  @Patch('verification-requests/:propertyId')
  @ApiOperation({ summary: "Update a property's verification status" })
  updateVerification(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: UpdateVerificationDto,
  ) {
    return this.admin.updateVerificationStatus(propertyId, dto.status, dto.reason);
  }
}

export { UpdateVerificationDto };
