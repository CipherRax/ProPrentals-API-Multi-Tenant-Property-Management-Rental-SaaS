import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { MessagingService } from './messaging.service';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

class StartMyConversationDto {
  @IsUUID()
  organizationId: string;
}

@ApiTags('messaging')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('tenants/me/conversations')
export class MyConversationsController {
  constructor(private readonly messagingService: MessagingService) {}

  @Post()
  start(@CurrentUser('userId') userId: string, @Body() dto: StartMyConversationDto) {
    return this.messagingService.startOrGetMyConversation(userId, dto.organizationId);
  }

  @Get()
  list(@CurrentUser('userId') userId: string) {
    return this.messagingService.listForTenant(userId);
  }

  @Get(':conversationId/messages')
  getMessages(
    @CurrentUser('userId') userId: string,
    @Param('conversationId') conversationId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.messagingService.getMessages(userId, conversationId, query);
  }

  @Get(':conversationId/unread-count')
  getUnreadCount(
    @CurrentUser('userId') userId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messagingService.getUnreadCount(userId, conversationId);
  }

  @Post(':conversationId/messages')
  sendMessage(
    @CurrentUser('userId') userId: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagingService.sendMessage(userId, conversationId, dto);
  }

  @Patch(':conversationId/read')
  markRead(@CurrentUser('userId') userId: string, @Param('conversationId') conversationId: string) {
    return this.messagingService.markRead(userId, conversationId);
  }
}
