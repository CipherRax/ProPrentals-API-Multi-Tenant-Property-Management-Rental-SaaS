import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { PeerConversationsService } from './peer-conversations.service';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

class StartPeerConversationDto {
  @IsUUID()
  peerUserId: string;
}

@ApiTags('messaging')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('organizations/:organizationId/peer-conversations')
export class PeerConversationsController {
  constructor(private readonly peerConversationsService: PeerConversationsService) {}

  @Post()
  start(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Body() dto: StartPeerConversationDto,
  ) {
    return this.peerConversationsService.start(userId, organizationId, dto.peerUserId);
  }

  @Get()
  list(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.peerConversationsService.list(userId, organizationId, query);
  }

  @Get(':peerConversationId/messages')
  getMessages(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('peerConversationId') peerConversationId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.peerConversationsService.getMessages(
      userId,
      organizationId,
      peerConversationId,
      query,
    );
  }

  @Post(':peerConversationId/messages')
  sendMessage(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('peerConversationId') peerConversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.peerConversationsService.sendMessage(
      userId,
      organizationId,
      peerConversationId,
      dto,
    );
  }

  @Patch(':peerConversationId/read')
  markRead(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('peerConversationId') peerConversationId: string,
  ) {
    return this.peerConversationsService.markRead(userId, organizationId, peerConversationId);
  }
}
