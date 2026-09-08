import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnnouncementsService } from './announcements.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('announcements')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('tenants/me/announcements')
export class MyAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @ApiOperation({ summary: 'List announcements visible to the logged-in tenant' })
  listMy(
    @CurrentUser('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.announcements.listForTenant(userId, Number(page) || 1, Number(limit) || 20);
  }

  @Get(':announcementId')
  @ApiOperation({ summary: 'Get a single announcement (marks it read for the tenant)' })
  getOne(
    @CurrentUser('userId') userId: string,
    @Param('announcementId', ParseUUIDPipe) announcementId: string,
  ) {
    return this.announcements.getForTenant(userId, announcementId);
  }
}
