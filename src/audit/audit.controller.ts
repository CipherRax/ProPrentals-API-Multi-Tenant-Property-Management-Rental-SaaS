import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuditQueryService } from './audit-query.service';
import { OrgRoles } from '../auth/decorators/roles.decorator';
import { PlatformRoles } from '../auth/decorators/platform-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { PlatformRolesGuard } from '../auth/guards/platform-roles.guard';

@ApiTags('Audit Log')
@ApiBearerAuth()
@Controller()
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get('organizations/:organizationId/audit-log')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  @ApiOperation({ summary: 'List audit log entries for an organization (owner/manager only)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'actorUserId', required: false })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'action', required: false })
  list(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
  ) {
    return this.audit.listForOrganization(userId, organizationId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      actorUserId,
      entityType,
      action,
    });
  }

  @Get('organizations/:organizationId/audit-log/:auditLogId')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  @ApiOperation({ summary: 'Get a single audit log entry (owner/manager only)' })
  getOne(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('auditLogId', ParseUUIDPipe) auditLogId: string,
  ) {
    return this.audit.getOne(userId, organizationId, auditLogId);
  }

  @Get('admin/organizations/:organizationId/audit-log')
  @UseGuards(JwtAccessGuard, PlatformRolesGuard)
  @PlatformRoles('SUPER_ADMIN', 'SUPPORT_ADMIN')
  @ApiOperation({ summary: "Platform admin: view any organization's audit log" })
  listAny(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.audit.listAnyOrganizationAudit(userId, organizationId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
