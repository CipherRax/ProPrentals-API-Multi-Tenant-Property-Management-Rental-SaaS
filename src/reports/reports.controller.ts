import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { OrgRoles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipResponseEnvelope } from '../common/decorators/skip-response-envelope.decorator';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('organizations/:organizationId/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('financial')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT')
  @ApiOperation({
    summary: 'Financial summary (expected/collected/outstanding/overdue rent, collection rate)',
  })
  financial(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.reports.financialReport(userId, organizationId);
  }

  @Get('financial/payment-breakdown')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT')
  @ApiOperation({ summary: 'Successful payments grouped by method and tenancy' })
  paymentBreakdown(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.reports.paymentBreakdown(userId, organizationId);
  }

  @Get('occupancy')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT')
  @ApiOperation({ summary: 'Occupancy summary (total/occupied/vacant/available, occupancy rate)' })
  occupancy(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.reports.occupancyReport(userId, organizationId);
  }

  @Get('tenants')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT')
  @ApiOperation({ summary: 'Tenant summary (active/former/new, expiring leases)' })
  tenants(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.reports.tenantReport(userId, organizationId);
  }

  @Get('maintenance')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT')
  @ApiOperation({ summary: 'Maintenance summary (open/resolved, by property)' })
  maintenance(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.reports.maintenanceReport(userId, organizationId);
  }

  @SkipResponseEnvelope()
  @Get('export/:kind')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT')
  @ApiOperation({ summary: 'Export a report as CSV or PDF' })
  async export(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('kind') kind: 'financial' | 'occupancy' | 'tenants' | 'maintenance',
    @Query('format') format: 'csv' | 'pdf',
    @Res() res: Response,
  ) {
    const result = await this.reports.export(userId, organizationId, kind, format ?? 'csv');

    if (result.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${kind}-report.pdf"`);
      res.send(result.pdfBuffer);
      return;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${kind}-report.csv"`);
    res.send(result.csv);
  }
}
