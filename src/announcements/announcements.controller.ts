import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { QueryAnnouncementsDto } from './dto/query-announcements.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgRoles } from '../auth/decorators/roles.decorator';

@ApiTags('Announcements')
@ApiBearerAuth()
@Controller()
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Post('organizations/:organizationId/announcements')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER')
  @ApiOperation({ summary: 'Create and broadcast an announcement to tenants' })
  create(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.announcements.create(userId, organizationId, dto);
  }

  @Get('organizations/:organizationId/announcements')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT', 'CARETAKER', 'STAFF')
  @ApiOperation({ summary: 'List announcements for an organization (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  list(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query() query: QueryAnnouncementsDto,
  ) {
    return this.announcements.list(userId, organizationId, query);
  }

  @Get('organizations/:organizationId/announcements/:announcementId')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT', 'CARETAKER', 'STAFF')
  @ApiOperation({ summary: 'Get a single announcement with read receipts' })
  getOne(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('announcementId', ParseUUIDPipe) announcementId: string,
  ) {
    return this.announcements.getOne(userId, organizationId, announcementId);
  }
}
