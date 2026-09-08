import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { MyConversationsController } from './my-conversations.controller';
import { ChatGateway } from './chat.gateway';
import { PresenceService } from './presence.service';
import { OrganizationsModule } from '../organizations/organizations.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [JwtModule.register({}), OrganizationsModule, NotificationsModule],
  controllers: [MessagingController, MyConversationsController],
  providers: [MessagingService, ChatGateway, PresenceService],
  exports: [MessagingService],
})
export class MessagingModule {}
