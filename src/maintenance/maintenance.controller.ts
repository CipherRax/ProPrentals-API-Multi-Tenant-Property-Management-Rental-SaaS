import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MaintenanceService } from './maintenance.service';
import { CreateMaintenanceRequestDto } from './dto/create-maintenance-request.dto';
import { UpdateMaintenanceStatusDto } from './dto/update-maintenance-status.dto';
import { QueryMaintenanceDto } from './dto/query-maintenance.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgRoles } from '../auth/decorators/roles.decorator';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';

@ApiTags('Maintenance')
@ApiBearerAuth()
@Controller()
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get('organizations/:organizationId/maintenance')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'CARETAKER', 'STAFF')
  @ApiOperation({
    summary: 'List maintenance requests for an organization (paginated, filterable)',
  })
  listForOrg(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query() query: QueryMaintenanceDto,
  ) {
    return this.maintenance.listForOrg(userId, organizationId, query);
  }

  @Get('organizations/:organizationId/maintenance/:requestId')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'CARETAKER', 'STAFF')
  @ApiOperation({ summary: 'Get a single maintenance request (org view)' })
  getForOrg(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.maintenance.getForOrg(userId, organizationId, requestId);
  }

  @Patch('organizations/:organizationId/maintenance/:requestId/status')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'CARETAKER', 'STAFF')
  @ApiOperation({ summary: 'Update maintenance request status / assignment / resolution' })
  updateStatus(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: UpdateMaintenanceStatusDto,
  ) {
    return this.maintenance.updateStatus(userId, organizationId, requestId, dto);
  }
}

@ApiTags('maintenance')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('tenants/me/maintenance')
export class MyMaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a maintenance request for a unit the tenant occupies' })
  createForTenant(@CurrentUser('userId') userId: string, @Body() dto: CreateMaintenanceRequestDto) {
    return this.maintenance.createForTenant(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: "List the tenant's own maintenance requests" })
  listMy(@CurrentUser('userId') userId: string, @Query() query: QueryMaintenanceDto) {
    return this.maintenance.listMyRequests(userId, query);
  }

  @Get(':requestId')
  @ApiOperation({ summary: "Get one of the tenant's own maintenance requests" })
  getMy(
    @CurrentUser('userId') userId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.maintenance.getMyRequest(userId, requestId);
  }
}
