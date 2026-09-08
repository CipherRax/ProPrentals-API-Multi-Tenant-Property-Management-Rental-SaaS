import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { UpdatePreferenceDto } from './dto/update-preferences.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('notifications/me')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser('userId') userId: string, @Query() query: PaginationQueryDto) {
    return this.notificationsService.listForUser(userId, query.page, query.limit);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser('userId') userId: string) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Patch(':notificationId/read')
  markRead(@CurrentUser('userId') userId: string, @Param('notificationId') notificationId: string) {
    return this.notificationsService.markRead(userId, notificationId);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser('userId') userId: string) {
    return this.notificationsService.markAllRead(userId);
  }

  @Get('preferences')
  getPreferences(@CurrentUser('userId') userId: string) {
    return this.notificationsService.getMyPreferences(userId);
  }

  @Patch('preferences')
  updatePreference(@CurrentUser('userId') userId: string, @Body() dto: UpdatePreferenceDto) {
    return this.notificationsService.updateMyPreference(userId, dto.category, {
      inAppEnabled: dto.inAppEnabled,
      emailEnabled: dto.emailEnabled,
      smsEnabled: dto.smsEnabled,
    });
  }
}
