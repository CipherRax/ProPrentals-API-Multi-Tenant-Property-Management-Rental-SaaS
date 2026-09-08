import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MessagingService } from './messaging.service';
import { StartConversationDto } from './dto/start-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@ApiTags('messaging')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('organizations/:organizationId/conversations')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Post()
  start(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Body() dto: StartConversationDto,
  ) {
    return this.messagingService.startOrGetConversation(
      userId,
      organizationId,
      dto.tenantProfileId,
    );
  }

  @Get()
  list(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.messagingService.listForOrg(userId, organizationId, query);
  }

  @Get(':conversationId/messages')
  getMessages(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('conversationId') conversationId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.messagingService.getMessages(userId, conversationId, query, organizationId);
  }

  @Get(':conversationId/unread-count')
  getUnreadCount(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messagingService.getUnreadCount(userId, conversationId, organizationId);
  }

  @Post(':conversationId/messages')
  sendMessage(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagingService.sendMessage(userId, conversationId, dto, organizationId);
  }

  @Patch(':conversationId/read')
  markRead(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messagingService.markRead(userId, conversationId, organizationId);
  }
}
